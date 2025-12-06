from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Tuple
import uuid
from datetime import datetime, timezone
import pdfplumber
import io
import re
from fuzzywuzzy import fuzz
import colorsys

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
    valor_venda_color: Optional[str] = None
    limite_sistema_color: Optional[str] = None
    limite_tabela_color: Optional[str] = None
    cinco_porcento_color: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PDFMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    items_count: int
    upload_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_default: bool = True

class BatchQuotationRequest(BaseModel):
    item_names: List[str]

class FavoriteRequest(BaseModel):
    item_name: str

class MatchedItemDetail(BaseModel):
    """Individual matched item with all fields"""
    item_id: str
    matched_item_name: str
    valor_venda: str
    limite_sistema: str
    limite_tabela: str
    cinco_porcento_original: str
    cinco_porcento_display: str
    fallback_applied: bool
    is_favorite: bool
    # Color coding
    valor_venda_color: Optional[str] = None
    limite_sistema_color: Optional[str] = None
    limite_tabela_color: Optional[str] = None
    cinco_porcento_color: Optional[str] = None

class GreenLimitItem(BaseModel):
    """Item with empty 5% and green-highlighted Limite Tabela"""
    item_id: str
    produto: str
    valor_venda: str
    limite_sistema: str
    limite_tabela: str
    limite_tabela_color: str  # Will always be 'green'

class GreenLimitResponse(BaseModel):
    items: List[GreenLimitItem]
    total_count: int

class KeywordResults(BaseModel):
    """Results for a single keyword search"""
    keyword: str
    matches: List[MatchedItemDetail]
    total_matches: int
    exact_match_found: bool

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

class FavoriteItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

def rgb_to_hsv(r: float, g: float, b: float) -> Tuple[float, float, float]:
    """Convert RGB (0-1 range) to HSV"""
    return colorsys.rgb_to_hsv(r, g, b)

def classify_highlight_color(rgb: Tuple[float, float, float]) -> Optional[str]:
    """
    Classify highlight color using HSV color space analysis.
    Returns 'green' for green highlights, 'yellow' for yellow highlights, None otherwise.
    """
    if rgb is None or len(rgb) != 3:
        return None
    
    r, g, b = rgb
    
    # Skip if it's very dark (not a highlight)
    if max(r, g, b) < 0.5:
        return None
    
    # Convert to HSV for better color classification
    h, s, v = rgb_to_hsv(r, g, b)
    
    # Convert hue to degrees (0-360)
    hue_deg = h * 360
    
    # High brightness indicates potential highlight
    is_bright = v > 0.75
    
    if not is_bright:
        return None
    
    # Green highlight detection
    if 80 <= hue_deg <= 160:
        if s > 0.15:
            return 'green'
    
    # Extended green range for edge cases
    if 70 <= hue_deg < 80 or 160 < hue_deg <= 180:
        if s > 0.25 and g > 0.7:
            return 'green'
    
    # Yellow highlight detection
    if 40 <= hue_deg < 70:
        if s > 0.30:
            return 'yellow'
    
    if 45 <= hue_deg <= 65:
        if s > 0.20:
            return 'yellow'
    
    return None

def extract_cell_background_color(page, bbox: Tuple[float, float, float, float]) -> Optional[str]:
    """Extract background color from a cell region"""
    x0, top, x1, bottom = bbox
    
    try:
        chars = page.within_bbox((x0, top, x1, bottom)).chars
        
        if not chars:
            return None
        
        colors_found = []
        
        for char in chars:
            if hasattr(char, 'non_stroking_color') and char['non_stroking_color']:
                color = char['non_stroking_color']
                
                if isinstance(color, (list, tuple)) and len(color) >= 3:
                    if max(color[:3]) > 1:
                        rgb = tuple(c / 255.0 for c in color[:3])
                    else:
                        rgb = tuple(color[:3])
                    
                    classified = classify_highlight_color(rgb)
                    if classified:
                        colors_found.append(classified)
        
        if colors_found:
            green_count = colors_found.count('green')
            yellow_count = colors_found.count('yellow')
            
            if green_count > yellow_count:
                return 'green'
            elif yellow_count > green_count:
                return 'yellow'
            elif green_count > 0:
                return 'green'
        
    except Exception as e:
        logging.debug(f"Color extraction error: {str(e)}")
    
    return None

def clean_price_value(value: str) -> str:
    """Clean price value, keep original format"""
    if not value or value.strip() == '':
        return ''
    return value.strip()

def parse_pdf_pricing_table(pdf_bytes: bytes) -> List[dict]:
    """Parse PDF and extract pricing table data with enhanced color detection"""
    items = []
    
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            
            for table in tables:
                for row_idx, row in enumerate(table[1:], start=1):
                    if len(row) >= 5 and row[0]:
                        produto = row[0].strip() if row[0] else ''
                        
                        if not produto:
                            continue
                        
                        try:
                            valor_venda_color = None
                            limite_sistema_color = None
                            limite_tabela_color = None
                            cinco_porcento_color = None
                            
                        except Exception as e:
                            logging.debug(f"Color detection error for row: {str(e)}")
                        
                        item = {
                            'produto': produto,
                            'valor_venda': clean_price_value(row[1]),
                            'limite_sistema': clean_price_value(row[2]),
                            'limite_tabela': clean_price_value(row[3]),
                            'cinco_porcento': clean_price_value(row[4]),
                            'valor_venda_color': valor_venda_color,
                            'limite_sistema_color': limite_sistema_color,
                            'limite_tabela_color': limite_tabela_color,
                            'cinco_porcento_color': cinco_porcento_color,
                        }
                        items.append(item)
            
            logging.info(f"Processed page {page_num + 1}, found {len(items)} items so far")
    
    return items

def check_exact_match(query: str, item_name: str) -> bool:
    """Check if query exactly matches the full item name"""
    return query.strip().lower() == item_name.strip().lower()

def fuzzy_match_multiple(query: str, all_items: List[dict], threshold: int = 60) -> tuple:
    """Find all items matching the query"""
    if not all_items:
        return (False, [])
    
    matches = []
    query_lower = query.lower().strip()
    exact_match_found = False
    
    for item in all_items:
        if check_exact_match(query, item['produto']):
            matches = [(item, 100)]
            exact_match_found = True
            return (exact_match_found, matches)
    
    for item in all_items:
        item_name = item['produto']
        item_name_lower = item_name.lower()
        
        if query_lower in item_name_lower:
            score = 95
            matches.append((item, score))
            continue
        
        query_words = query_lower.split()
        if all(word in item_name_lower for word in query_words):
            matches.append((item, 85))
            continue
        
        token_score = fuzz.token_sort_ratio(query_lower, item_name_lower)
        if token_score >= threshold:
            matches.append((item, token_score))
            continue
        
        partial_score = fuzz.partial_ratio(query_lower, item_name_lower)
        if partial_score >= threshold + 10:
            matches.append((item, partial_score))
    
    matches.sort(key=lambda x: (-x[1], x[0]['produto']))
    
    return (exact_match_found, matches)

async def get_favorites_set() -> set:
    """Get set of favorited item names"""
    favorites = await db.favorites.find({}, {"_id": 0, "item_name": 1}).to_list(10000)
    return {fav['item_name'] for fav in favorites}

@api_router.get("/")
async def root():
    return {"message": "PDF Pricing Quotation API - Enhanced Color Detection"}

@api_router.post("/upload-pdf", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Upload and parse PDF pricing table with enhanced color detection"""
    try:
        if not file.filename.endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")
        
        pdf_bytes = await file.read()
        items = parse_pdf_pricing_table(pdf_bytes)
        
        if not items:
            raise HTTPException(status_code=400, detail="No pricing data found in PDF")
        
        await db.pdf_metadata.update_many({}, {"$set": {"is_default": False}})
        await db.pricing_items.delete_many({})
        
        items_with_metadata = []
        for item in items:
            pricing_item = PricingItem(**item)
            doc = pricing_item.model_dump()
            doc['timestamp'] = doc['timestamp'].isoformat()
            items_with_metadata.append(doc)
        
        await db.pricing_items.insert_many(items_with_metadata)
        
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

@api_router.get("/items-green-limit", response_model=GreenLimitResponse)
async def get_items_with_green_limit():
    """
    Get all items where:
    1. 5% field is empty/missing
    2. Limite Tabela has a green highlight in PDF
    """
    try:
        # Query items where cinco_porcento is empty AND limite_tabela_color is 'green'
        query = {
            "$or": [
                {"cinco_porcento": ""},
                {"cinco_porcento": {"$exists": False}}
            ],
            "limite_tabela_color": "green",
            "limite_tabela": {"$ne": ""}  # Ensure limite_tabela has a value
        }
        
        items = await db.pricing_items.find(query, {"_id": 0}).to_list(10000)
        
        green_limit_items = []
        for item in items:
            green_item = GreenLimitItem(
                item_id=item['id'],
                produto=item['produto'],
                valor_venda=item.get('valor_venda', 'N/A'),
                limite_sistema=item.get('limite_sistema', 'N/A'),
                limite_tabela=item['limite_tabela'],
                limite_tabela_color='green'
            )
            green_limit_items.append(green_item)
        
        return GreenLimitResponse(
            items=green_limit_items,
            total_count=len(green_limit_items)
        )
    
    except Exception as e:
        logging.error(f"Error getting green limit items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

@api_router.post("/quotation-batch", response_model=BatchQuotationResponse)
async def get_batch_quotation(request: BatchQuotationRequest):
    """Get quotations for unlimited keywords with exact/partial matching and favorites priority"""
    try:
        if len(request.item_names) == 0:
            raise HTTPException(status_code=400, detail="At least one keyword required")
        
        all_items = await db.pricing_items.find({}, {"_id": 0}).to_list(10000)
        
        if not all_items:
            raise HTTPException(status_code=404, detail="No pricing data available. Please upload a PDF first.")
        
        favorites_set = await get_favorites_set()
        
        results = []
        total_items_found = 0
        
        for keyword in request.item_names:
            keyword = keyword.strip()
            
            if not keyword:
                continue
            
            exact_match_found, matches = fuzzy_match_multiple(keyword, all_items, threshold=60)
            
            matched_items = []
            favorites = []
            non_favorites = []
            
            for matched_item, score in matches:
                valor_venda = matched_item.get('valor_venda', '')
                limite_sistema = matched_item.get('limite_sistema', '')
                limite_tabela = matched_item.get('limite_tabela', '')
                cinco_porcento = matched_item.get('cinco_porcento', '').strip()
                
                fallback_applied = False
                cinco_porcento_display = cinco_porcento
                
                if not cinco_porcento or cinco_porcento == '':
                    cinco_porcento_display = limite_tabela if limite_tabela else 'N/A'
                    fallback_applied = True if limite_tabela else False
                
                is_favorite = matched_item['produto'] in favorites_set
                
                item_detail = MatchedItemDetail(
                    item_id=matched_item['id'],
                    matched_item_name=matched_item['produto'],
                    valor_venda=valor_venda if valor_venda else 'N/A',
                    limite_sistema=limite_sistema if limite_sistema else 'N/A',
                    limite_tabela=limite_tabela if limite_tabela else 'N/A',
                    cinco_porcento_original=cinco_porcento if cinco_porcento else 'N/A',
                    cinco_porcento_display=cinco_porcento_display if cinco_porcento_display else 'N/A',
                    fallback_applied=fallback_applied,
                    is_favorite=is_favorite,
                    valor_venda_color=matched_item.get('valor_venda_color'),
                    limite_sistema_color=matched_item.get('limite_sistema_color'),
                    limite_tabela_color=matched_item.get('limite_tabela_color'),
                    cinco_porcento_color=matched_item.get('cinco_porcento_color')
                )
                
                if is_favorite:
                    favorites.append(item_detail)
                else:
                    non_favorites.append(item_detail)
            
            matched_items = favorites + non_favorites
            total_items_found += len(matched_items)
            
            results.append(KeywordResults(
                keyword=keyword,
                matches=matched_items,
                total_matches=len(matched_items),
                exact_match_found=exact_match_found
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

@api_router.post("/favorites/add")
async def add_favorite(request: FavoriteRequest):
    """Add item to favorites"""
    try:
        existing = await db.favorites.find_one({"item_name": request.item_name})
        
        if existing:
            return {"message": "Item already in favorites", "status": "exists"}
        
        fav = FavoriteItem(item_name=request.item_name)
        doc = fav.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        await db.favorites.insert_one(doc)
        
        return {"message": "Item added to favorites", "status": "added"}
    
    except Exception as e:
        logging.error(f"Error adding favorite: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error adding favorite: {str(e)}")

@api_router.delete("/favorites/remove")
async def remove_favorite(request: FavoriteRequest):
    """Remove item from favorites"""
    try:
        result = await db.favorites.delete_one({"item_name": request.item_name})
        
        if result.deleted_count > 0:
            return {"message": "Item removed from favorites", "status": "removed"}
        else:
            return {"message": "Item not found in favorites", "status": "not_found"}
    
    except Exception as e:
        logging.error(f"Error removing favorite: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error removing favorite: {str(e)}")

@api_router.get("/favorites/list")
async def list_favorites():
    """Get all favorited items"""
    try:
        favorites = await db.favorites.find({}, {"_id": 0}).to_list(10000)
        return {"favorites": [f['item_name'] for f in favorites], "total": len(favorites)}
    
    except Exception as e:
        logging.error(f"Error listing favorites: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing favorites: {str(e)}")

@api_router.get("/default-pdf-status", response_model=DefaultPDFStatus)
async def get_default_pdf_status():
    """Get status of current default PDF"""
    try:
        default_pdf = await db.pdf_metadata.find_one(
            {"is_default": True},
            {"_id": 0}
        )
        
        if default_pdf:
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
    """Get all pricing items"""
    items = await db.pricing_items.find({}, {"_id": 0}).limit(limit).to_list(limit)
    
    for item in items:
        if isinstance(item.get('timestamp'), str):
            item['timestamp'] = datetime.fromisoformat(item['timestamp'])
    
    return items

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