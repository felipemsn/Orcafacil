import requests
import sys
import json
from datetime import datetime
from pathlib import Path

class PDFPricingAPITester:
    def __init__(self, base_url="https://price-finder-117.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test_name": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {}
        
        if data and not files:
            headers['Content-Type'] = 'application/json'

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, data=data, timeout=60)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=30)

            success = response.status_code == expected_status
            
            if success:
                print(f"   Status: {response.status_code} ✅")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                except:
                    print(f"   Response: {response.text[:200]}...")
            else:
                print(f"   Expected {expected_status}, got {response.status_code} ❌")
                print(f"   Response: {response.text[:300]}")

            self.log_test(name, success, f"Status: {response.status_code}, Expected: {expected_status}")
            return success, response.json() if success and response.content else {}

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            print(f"   {error_msg} ❌")
            self.log_test(name, False, error_msg)
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )

    def test_default_pdf_status_empty(self):
        """Test default PDF status when no PDF is uploaded"""
        return self.run_test(
            "Default PDF Status (Empty)",
            "GET",
            "default-pdf-status",
            200
        )

    def test_upload_pdf(self):
        """Test PDF upload functionality"""
        pdf_path = Path("/app/231025Tabela.pdf")
        
        if not pdf_path.exists():
            self.log_test("PDF Upload", False, "Test PDF file not found")
            return False, {}
        
        try:
            with open(pdf_path, 'rb') as f:
                files = {'file': ('231025Tabela.pdf', f, 'application/pdf')}
                success, response = self.run_test(
                    "PDF Upload",
                    "POST",
                    "upload-pdf",
                    200,
                    files=files
                )
                return success, response
        except Exception as e:
            self.log_test("PDF Upload", False, f"File error: {str(e)}")
            return False, {}

    def test_default_pdf_status_with_data(self):
        """Test default PDF status after upload"""
        return self.run_test(
            "Default PDF Status (With Data)",
            "GET",
            "default-pdf-status",
            200
        )

    def test_items_count(self):
        """Test items count endpoint"""
        return self.run_test(
            "Items Count",
            "GET",
            "items-count",
            200
        )

    def test_get_items(self):
        """Test get all items endpoint"""
        return self.run_test(
            "Get All Items",
            "GET",
            "items?limit=10",
            200
        )

    def test_batch_quotation_valid(self):
        """Test batch quotation with valid items"""
        test_items = [
            "THINER 5 LITROS FARBEN",
            "ACAB. EMBUTIR PERFIL LED",
            "THINER 5 LITROS"  # Fuzzy match test
        ]
        
        return self.run_test(
            "Batch Quotation (Valid Items)",
            "POST",
            "quotation-batch",
            200,
            data={"item_names": test_items}
        )

    def test_batch_quotation_fuzzy_match(self):
        """Test fuzzy matching with misspelled items"""
        test_items = [
            "THINER 5 LITROS",  # Slightly different from exact name
            "ACAB EMBUTIR",     # Partial name
            "NONEXISTENT ITEM"  # Should not be found
        ]
        
        return self.run_test(
            "Batch Quotation (Fuzzy Match)",
            "POST",
            "quotation-batch",
            200,
            data={"item_names": test_items}
        )

    def test_batch_quotation_max_items(self):
        """Test batch quotation with maximum items (15)"""
        test_items = [f"TEST ITEM {i}" for i in range(1, 16)]  # 15 items
        
        return self.run_test(
            "Batch Quotation (Max 15 Items)",
            "POST",
            "quotation-batch",
            200,
            data={"item_names": test_items}
        )

    def test_batch_quotation_too_many_items(self):
        """Test batch quotation with too many items (should fail)"""
        test_items = [f"TEST ITEM {i}" for i in range(1, 17)]  # 16 items
        
        return self.run_test(
            "Batch Quotation (Too Many Items)",
            "POST",
            "quotation-batch",
            400,
            data={"item_names": test_items}
        )

    def test_batch_quotation_empty(self):
        """Test batch quotation with empty list"""
        return self.run_test(
            "Batch Quotation (Empty List)",
            "POST",
            "quotation-batch",
            400,
            data={"item_names": []}
        )

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting PDF Pricing API Tests")
        print(f"   Base URL: {self.base_url}")
        print("=" * 60)

        # Test basic endpoints
        self.test_root_endpoint()
        self.test_default_pdf_status_empty()
        
        # Test PDF upload
        upload_success, upload_response = self.test_upload_pdf()
        
        if upload_success:
            # Test endpoints that require data
            self.test_default_pdf_status_with_data()
            self.test_items_count()
            self.test_get_items()
            
            # Test quotation functionality
            self.test_batch_quotation_valid()
            self.test_batch_quotation_fuzzy_match()
            self.test_batch_quotation_max_items()
            
            # Test error cases
            self.test_batch_quotation_too_many_items()
            self.test_batch_quotation_empty()
        else:
            print("\n⚠️  PDF upload failed - skipping data-dependent tests")

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("❌ Some tests failed!")
            return 1

def main():
    tester = PDFPricingAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())