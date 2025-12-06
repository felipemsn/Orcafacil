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

class QuotationRequest(BaseModel):
    item_name: str

class QuotationResponse(BaseModel):
    item_name: str
    quotation_value: str
    source: str  # "5%" or "limit"
    full_item_data: Optional[dict] = None

class UploadResponse(BaseModel):
    message: str
    items_count: int

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

@api_router.get("/")
async def root():
    return {"message": "PDF Pricing Quotation API"}

@api_router.post("/upload-pdf", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Upload and parse PDF pricing table"""
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
        
        return UploadResponse(
            message="PDF processed successfully",
            items_count=len(items)
        )
    
    except Exception as e:
        logging.error(f"Error processing PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")

@api_router.post("/quotation", response_model=QuotationResponse)
async def get_quotation(request: QuotationRequest):
    """Get quotation for an item"""
    try:
        # Search for item (case-insensitive)
        item_name = request.item_name.strip()
        
        # Try exact match first
        item = await db.pricing_items.find_one(
            {"produto": {"$regex": f"^{re.escape(item_name)}$", "$options": "i"}},
            {"_id": 0}
        )
        
        # If no exact match, try partial match
        if not item:
            item = await db.pricing_items.find_one(
                {"produto": {"$regex": re.escape(item_name), "$options": "i"}},
                {"_id": 0}
            )
        
        if not item:
            raise HTTPException(status_code=404, detail=f"Item '{item_name}' not found in pricing table")
        
        # Apply pricing logic: 5% column first, fallback to limite_tabela
        cinco_porcento = item.get('cinco_porcento', '').strip()
        limite_tabela = item.get('limite_tabela', '').strip()
        
        if cinco_porcento and cinco_porcento != '':
            quotation_value = cinco_porcento
            source = "5%"
        elif limite_tabela and limite_tabela != '':
            quotation_value = limite_tabela
            source = "limit"
        else:
            raise HTTPException(status_code=400, detail="No valid pricing found for this item")
        
        return QuotationResponse(
            item_name=item['produto'],
            quotation_value=quotation_value,
            source=source,
            full_item_data=item
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting quotation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

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