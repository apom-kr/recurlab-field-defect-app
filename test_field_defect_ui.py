import unittest
from pathlib import Path

ROOT = Path(__file__).parent
INDEX = (ROOT / "index.html").read_text(encoding="utf-8")
APP = (ROOT / "app.js").read_text(encoding="utf-8")
CSS = (ROOT / "styles.css").read_text(encoding="utf-8")
SW = (ROOT / "sw.js").read_text(encoding="utf-8")


class FieldDefectUiTest(unittest.TestCase):
    def test_assets_use_v14_cache_bust(self):
        self.assertIn("styles.css?v=14", INDEX)
        self.assertIn("app.js?v=14", INDEX)
        self.assertIn("field-defect-app-v14", SW)
        self.assertIn("styles.css?v=14", SW)
        self.assertIn("app.js?v=14", SW)

    def test_defect_item_first_flow_exists(self):
        self.assertIn("defectItems", APP)
        self.assertIn("addDefectItem", APP)
        self.assertIn("불량 항목 추가", INDEX)
        self.assertNotIn("사진별 유형/수량 입력", INDEX)

    def test_total_defect_qty_comes_from_defect_items_not_photos(self):
        self.assertIn("function getDefectQtyTotal()", APP)
        self.assertNotIn("photoDetails", APP)
        self.assertNotIn("getPhotoQtyTotal", APP)

    def test_save_defect_items_is_one_row_per_item(self):
        self.assertIn("async function saveDefectItems(reportId, uploadedItems)", APP)
        self.assertIn("uploadedItems.map", APP)
        self.assertIn("defect_qty: Number(item.qty)", APP)

    def test_item_photo_styles_exist(self):
        self.assertIn(".defect-item", CSS)
        self.assertIn(".item-photos", CSS)


if __name__ == "__main__":
    unittest.main()
