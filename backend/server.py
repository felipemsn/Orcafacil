from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import pdfplumber
import io
import re
from fuzzywuzzy import fuzz

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Define Models
class PricingItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    produto: str
    valor_venda: str
    limite_sistema: str
    limite_tabela: str
    cinco_porcento: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PDFMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    items_count: int
    upload_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_default: bool = True

class BatchQuotationRequest(BaseModel):
    item_names: List[str] = Field(..., max_length=15)

class MatchedItemDetail(BaseModel):
    """Individual matched item with all fields"""
    matched_item_name: str
    valor_venda: str
    limite_sistema: str
    limite_tabela: str
    cinco_porcento_original: str
    cinco_porcento_display: str  # With fallback applied if needed
    fallback_applied: bool
    match_score: int

class KeywordResults(BaseModel):
    """Results for a single keyword search"""
    keyword: str
    matches: List[MatchedItemDetail]
    total_matches: int

class BatchQuotationResponse(BaseModel):
    results: List[KeywordResults]
    total_keywords: int
    total_items_found: int

class UploadResponse(BaseModel):
    message: str
    items_count: int
    filename: str

class DefaultPDFStatus(BaseModel):
    has_default: bool
    filename: Optional[str] = None
    items_count: Optional[int] = None
    upload_timestamp: Optional[datetime] = None

def clean_price_value(value: str) -> str:
    """Clean price value, keep original format"""
    if not value or value.strip() == '':
        return ''
    return value.strip()

def parse_pdf_pricing_table(pdf_bytes: bytes) -> List[dict]:
    """Parse PDF and extract pricing table data"""
    items = []
    
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            
            for table in tables:
                # Skip header row
                for row in table[1:]:
                    if len(row) >= 5 and row[0]:  # Ensure we have all columns and product name
                        produto = row[0].strip() if row[0] else ''
                        
                        # Skip empty rows
                        if not produto:
                            continue
                        
                        item = {
                            'produto': produto,
                            'valor_venda': clean_price_value(row[1]),
                            'limite_sistema': clean_price_value(row[2]),
                            'limite_tabela': clean_price_value(row[3]),
                            'cinco_porcento': clean_price_value(row[4])
                        }
                        items.append(item)
    
    return items

def fuzzy_match_multiple(query: str, all_items: List[dict], threshold: int = 60) -> List[tuple]:
    """Find all items matching the query with fuzzy matching"""
    if not all_items:
        return []
    
    matches = []
    query_lower = query.lower()
    
    for item in all_items:
        item_name = item['produto']
        item_name_lower = item_name.lower()
        
        # Strategy 1: Exact substring match (case-insensitive)
        if query_lower in item_name_lower:
            score = 100 if query_lower == item_name_lower else 90
            matches.append((item, score))
            continue
        
        # Strategy 2: Check if all words in query appear in item name
        query_words = query_lower.split()
        if all(word in item_name_lower for word in query_words):
            matches.append((item, 85))
            continue
        
        # Strategy 3: Fuzzy matching
        # Use token sort ratio for word order independence
        token_score = fuzz.token_sort_ratio(query_lower, item_name_lower)
        if token_score >= threshold:
            matches.append((item, token_score))
            continue
        
        # Strategy 4: Partial ratio for substring similarity
        partial_score = fuzz.partial_ratio(query_lower, item_name_lower)
        if partial_score >= threshold + 10:  # Higher threshold for partial matching
            matches.append((item, partial_score))
    
    # Sort by score (highest first), then by item name
    matches.sort(key=lambda x: (-x[1], x[0]['produto']))
    
    return matches

@api_router.get("/")
async def root():
    return {"message": "PDF Pricing Quotation API - Multi-Match Enhanced Version"}

@api_router.post("/upload-pdf", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Upload and parse PDF pricing table, set as default"""
    try:
        # Validate file type
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
        # Read PDF content
        pdf_bytes = await file.read()
        
        # Parse PDF
        items = parse_pdf_pricing_table(pdf_bytes)
        
        if not items:
            raise HTTPException(status_code=400, detail="No pricing data found in PDF")
        
        # Mark all existing PDFs as non-default
        await db.pdf_metadata.update_many({}, {"$set": {"is_default": False}})
        
        # Clear existing pricing data
        await db.pricing_items.delete_many({})
        
        # Insert new pricing data
        items_with_metadata = []
        for item in items:
            pricing_item = PricingItem(**item)
            doc = pricing_item.model_dump()
            doc['timestamp'] = doc['timestamp'].isoformat()
            items_with_metadata.append(doc)
        
        await db.pricing_items.insert_many(items_with_metadata)
        
        # Store PDF metadata
        pdf_meta = PDFMetadata(
            filename=file.filename,
            items_count=len(items),
            is_default=True
        )
        meta_doc = pdf_meta.model_dump()
        meta_doc['upload_timestamp'] = meta_doc['upload_timestamp'].isoformat()
        await db.pdf_metadata.insert_one(meta_doc)
        
        return UploadResponse(
            message="PDF set as default pricing table",
            items_count=len(items),
            filename=file.filename
        )
    
    except Exception as e:
        logging.error(f"Error processing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@api_router.post("/quotation-batch", response_model=BatchQuotationResponse)
async def get_batch_quotation(request: BatchQuotationRequest):
    """Get quotations for multiple keywords (up to 15), returning all matches per keyword"""
    try:
        if len(request.item_names) > 15:
            raise HTTPException(status_code=400, detail="Maximum 15 keywords allowed per query")
        
        if len(request.item_names) == 0:
            raise HTTPException(status_code=400, detail="At least one keyword required")
        
        # Get all items from database
        all_items = await db.pricing_items.find({}, {"_id": 0}).to_list(10000)
        
        if not all_items:
            raise HTTPException(status_code=404, detail="No pricing data available. Please upload a PDF first.")
        
        results = []
        total_items_found = 0
        
        for keyword in request.item_names:
            keyword = keyword.strip()
            
            if not keyword:
                continue
            
            # Find all matching items for this keyword
            matches = fuzzy_match_multiple(keyword, all_items, threshold=60)
            
            matched_items = []
            for matched_item, score in matches:
                # Get all field values
                valor_venda = matched_item.get('valor_venda', '')
                limite_sistema = matched_item.get('limite_sistema', '')
                limite_tabela = matched_item.get('limite_tabela', '')
                cinco_porcento = matched_item.get('cinco_porcento', '').strip()
                
                # Apply fallback logic: if 5% is empty, use limite_tabela
                fallback_applied = False
                cinco_porcento_display = cinco_porcento
                
                if not cinco_porcento or cinco_porcento == '':
                    cinco_porcento_display = limite_tabela if limite_tabela else 'N/A'
                    fallback_applied = True if limite_tabela else False
                
                matched_items.append(MatchedItemDetail(
                    matched_item_name=matched_item['produto'],
                    valor_venda=valor_venda if valor_venda else 'N/A',
                    limite_sistema=limite_sistema if limite_sistema else 'N/A',
                    limite_tabela=limite_tabela if limite_tabela else 'N/A',
                    cinco_porcento_original=cinco_porcento if cinco_porcento else 'N/A',
                    cinco_porcento_display=cinco_porcento_display if cinco_porcento_display else 'N/A',
                    fallback_applied=fallback_applied,
                    match_score=score
                ))
            
            total_items_found += len(matched_items)
            
            results.append(KeywordResults(
                keyword=keyword,
                matches=matched_items,
                total_matches=len(matched_items)
            ))
        
        return BatchQuotationResponse(
            results=results,
            total_keywords=len(results),
            total_items_found=total_items_found
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting batch quotation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

@api_router.get("/default-pdf-status", response_model=DefaultPDFStatus)
async def get_default_pdf_status():
    """Get status of current default PDF"""
    try:
        default_pdf = await db.pdf_metadata.find_one(
            {"is_default": True},
            {"_id": 0}
        )
        
        if default_pdf:
            # Convert ISO string to datetime if needed
            upload_ts = default_pdf.get('upload_timestamp')
            if isinstance(upload_ts, str):
                upload_ts = datetime.fromisoformat(upload_ts)
            
            return DefaultPDFStatus(
                has_default=True,
                filename=default_pdf['filename'],
                items_count=default_pdf['items_count'],
                upload_timestamp=upload_ts
            )
        else:
            return DefaultPDFStatus(has_default=False)
    
    except Exception as e:
        logging.error(f"Error getting default PDF status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting status: {str(e)}")

@api_router.get("/items", response_model=List[PricingItem])
async def get_all_items(limit: int = 100):
    """Get all pricing items (for debugging)"""
    items = await db.pricing_items.find({}, {"_id": 0}).limit(limit).to_list(limit)
    
    # Convert ISO string timestamps back to datetime objects
    for item in items:
        if isinstance(item.get('timestamp'), str):
            item['timestamp'] = datetime.fromisoformat(item['timestamp'])
    
    return items

@api_router.get("/items-count")
async def get_items_count():
    """Get count of items in database"""
    count = await db.pricing_items.count_documents({})
    return {"count": count}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()