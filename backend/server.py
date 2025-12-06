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
from fuzzywuzzy import fuzz, process

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

class ItemQuotationResult(BaseModel):
    item_name: str
    matched_item_name: Optional[str] = None
    cinco_porcento_value: str
    limite_value: str
    active_value: str
    source: str  # "5%" or "limit"
    match_score: Optional[int] = None
    found: bool = True

class BatchQuotationResponse(BaseModel):
    results: List[ItemQuotationResult]
    total_queried: int
    total_found: int

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

def fuzzy_match_item(query: str, all_items: List[dict], threshold: int = 70) -> Optional[tuple]:
    """Fuzzy match item name with scoring"""
    if not all_items:
        return None
    
    # Extract all product names
    product_names = [item['produto'] for item in all_items]
    
    # Try exact match first (case-insensitive)
    for item in all_items:
        if item['produto'].lower() == query.lower():
            return (item, 100)
    
    # Use fuzzy matching with multiple strategies
    # Strategy 1: Token sort ratio (handles word order)
    best_match = process.extractOne(query, product_names, scorer=fuzz.token_sort_ratio)
    
    if best_match and best_match[1] >= threshold:
        matched_name = best_match[0]
        score = best_match[1]
        matched_item = next(item for item in all_items if item['produto'] == matched_name)
        return (matched_item, score)
    
    # Strategy 2: Partial ratio (for substring matches)
    best_partial = process.extractOne(query, product_names, scorer=fuzz.partial_ratio)
    
    if best_partial and best_partial[1] >= threshold:
        matched_name = best_partial[0]
        score = best_partial[1]
        matched_item = next(item for item in all_items if item['produto'] == matched_name)
        return (matched_item, score)
    
    return None

@api_router.get("/")
async def root():
    return {"message": "PDF Pricing Quotation API - Enhanced Version"}

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
    """Get quotations for multiple items (up to 15)"""
    try:
        if len(request.item_names) > 15:
            raise HTTPException(status_code=400, detail="Maximum 15 items allowed per query")
        
        if len(request.item_names) == 0:
            raise HTTPException(status_code=400, detail="At least one item name required")
        
        # Get all items from database
        all_items = await db.pricing_items.find({}, {"_id": 0}).to_list(10000)
        
        if not all_items:
            raise HTTPException(status_code=404, detail="No pricing data available. Please upload a PDF first.")
        
        results = []
        found_count = 0
        
        for item_query in request.item_names:
            item_query = item_query.strip()
            
            if not item_query:
                continue
            
            # Fuzzy match the item
            match_result = fuzzy_match_item(item_query, all_items, threshold=60)
            
            if match_result:
                matched_item, score = match_result
                
                # Get both values
                cinco_porcento = matched_item.get('cinco_porcento', '').strip()
                limite_tabela = matched_item.get('limite_tabela', '').strip()
                
                # Determine active value and source
                if cinco_porcento and cinco_porcento != '':
                    active_value = cinco_porcento
                    source = "5%"
                elif limite_tabela and limite_tabela != '':
                    active_value = limite_tabela
                    source = "limit"
                else:
                    active_value = "N/A"
                    source = "none"
                
                results.append(ItemQuotationResult(
                    item_name=item_query,
                    matched_item_name=matched_item['produto'],
                    cinco_porcento_value=cinco_porcento if cinco_porcento else "N/A",
                    limite_value=limite_tabela if limite_tabela else "N/A",
                    active_value=active_value,
                    source=source,
                    match_score=score,
                    found=True
                ))
                found_count += 1
            else:
                # Item not found
                results.append(ItemQuotationResult(
                    item_name=item_query,
                    matched_item_name=None,
                    cinco_porcento_value="N/A",
                    limite_value="N/A",
                    active_value="N/A",
                    source="none",
                    match_score=0,
                    found=False
                ))
        
        return BatchQuotationResponse(
            results=results,
            total_queried=len(request.item_names),
            total_found=found_count
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