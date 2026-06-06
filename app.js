const SUPABASE_URL = "https://rlsdcgwldfpqhdwqrdpp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsc2RjZ3dsZGZwcWhkd3FyZHBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMzA0MDAsImV4cCI6MjA4NTYwNjQwMH0.0XIBe4q3Z6BdKJIPpWERf-GPQiIj10VZnePVjBS2ylw";
const BUCKET = "defect-photos";
const DEFECT_TYPES = ["제품불량", "포장불량", "라벨불량", "수량오류", "오염", "파손", "기타"];
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let selectedType = "제품불량";
let selectedFiles = [];
let scannerControls = null;
let scannerReader = null;
let lastLookupProduct = null;

const today = new Date().toISOString().slice(0, 10);
$("inspectionDate").value = today;
$("deviceLabel").value = localStorage.getItem("fieldDeviceLabel") || `현장기기-${crypto.randomUUID().slice(0, 8)}`;
localStorage.setItem("fieldDeviceLabel", $("deviceLabel").value);
$("inspectorName").value = localStorage.getItem("inspectorName") || "";
$("siteName").value = localStorage.getItem("siteName") || "";

function setMessage(text, type = "") {
  const message = $("message");
  message.textContent = text;
  message.className = `message ${type}`;
}

function setLookupMessage(text, type = "") {
  const message = $("lookupMessage");
  message.textContent = text;
  message.className = `inline-message ${type}`;
}

function scrollToField(id) {
  const field = $(id);
  field?.scrollIntoView({ behavior: "smooth", block: "center" });
  field?.focus?.();
}

function setBusy(isBusy) {
  $("submitBtn").disabled = isBusy;
  $("submitBtn").textContent = isBusy ? "저장 중..." : "불량 기록 저장";
  $("connectionStatus").textContent = isBusy ? "저장 중" : "저장 준비";
}

function renderTypeButtons() {
  const box = $("defectButtons");
  box.innerHTML = "";
  DEFECT_TYPES.forEach((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `type-btn ${type === selectedType ? "active" : ""}`;
    button.textContent = type;
    button.addEventListener("click", () => {
      selectedType = type;
      $("defectDetailBox").hidden = selectedType !== "기타";
      renderTypeButtons();
    });
    box.appendChild(button);
  });
}

function updateRate() {
  const inspected = Number($("totalInspectedQty").value || 0);
  const defect = Number($("totalDefectQty").value || 0);
  const rate = inspected > 0 ? (defect / inspected) * 100 : 0;
  $("defectRate").textContent = `${rate.toFixed(1)}%`;
}

function renderPreview() {
  const preview = $("preview");
  preview.innerHTML = "";
  selectedFiles.forEach((file) => {
    const img = document.createElement("img");
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
}

function validateForm() {
  const inspected = Number($("totalInspectedQty").value || 0);
  const defect = Number($("totalDefectQty").value || 0);
  const itemQty = Number($("defectItemQty").value || defect || 0);

  if (!$("productName").value.trim()) {
    scrollToField("productName");
    throw new Error("상품명을 입력해줘.");
  }
  if (!$("inspectorName").value.trim()) {
    scrollToField("inspectorName");
    throw new Error("검사자 이름을 입력해줘.");
  }
  if (inspected <= 0) {
    scrollToField("totalInspectedQty");
    throw new Error("검사 수량은 1 이상이어야 해.");
  }
  if (defect <= 0) {
    scrollToField("totalDefectQty");
    throw new Error("불량 수량은 1 이상이어야 해.");
  }
  if (inspected < 0 || defect < 0) {
    scrollToField("totalInspectedQty");
    throw new Error("수량은 0 이상이어야 해.");
  }
  if (defect > inspected) {
    scrollToField("totalDefectQty");
    throw new Error("불량 수량이 검사 수량보다 클 수 없어.");
  }
  if (itemQty <= 0) {
    scrollToField("defectItemQty");
    throw new Error("유형별 수량은 1 이상이어야 해.");
  }
  if (itemQty > defect) {
    scrollToField("defectItemQty");
    throw new Error("유형별 수량은 전체 불량 수량보다 클 수 없어.");
  }
  if (selectedType === "기타" && !$("defectDetail").value.trim()) {
    scrollToField("defectDetail");
    throw new Error("기타 상세 내용을 입력해줘.");
  }
  if (selectedFiles.length === 0) {
    scrollToField("photoBlock");
    throw new Error("불량 사진을 최소 1장 올려줘.");
  }
  const oversizedFile = selectedFiles.find((file) => file.size > MAX_PHOTO_SIZE_BYTES);
  if (oversizedFile) {
    scrollToField("photoBlock");
    throw new Error(`${oversizedFile.name} 파일이 10MB를 넘어. 압축하거나 다른 사진을 선택해줘.`);
  }
}

function applyProductLookup(product) {
  lastLookupProduct = product;
  $("supplierName").value = product.supplier_name || "";
  $("productName").value = product.product_name || "";
  $("optionName").value = product.option_name || "";
  const optionText = product.option_name ? ` / 옵션: ${product.option_name}` : " / 옵션 없음, 필요 시 직접 확인";
  setLookupMessage(`상품 자동입력 완료: ${product.product_name}${optionText}`, "ok");
  setMessage(`상품 자동입력 완료: ${product.product_name}`, "ok");
}

async function lookupProductByBarcode() {
  const barcode = $("barcode").value.trim();
  if (!barcode) return;
  try {
    setLookupMessage("바코드 상품 조회 중...");
    setMessage("바코드 상품 조회 중...");
    const { data, error } = await client.rpc("lookup_defect_product_by_barcode", { p_barcode: barcode });
    if (error) throw error;
    if (!data || data.length === 0) {
      lastLookupProduct = null;
      setLookupMessage("DB에서 상품을 못 찾았어. 상품명을 직접 입력해줘.", "err");
      setMessage("DB에서 상품을 못 찾았어. 상품명을 직접 입력해줘.", "err");
      scrollToField("productName");
      return;
    }
    applyProductLookup(data[0]);
  } catch (error) {
    console.error(error);
    lastLookupProduct = null;
    setLookupMessage("상품 조회 실패. 직접 입력으로 진행하거나 네트워크 확인 후 다시 시도해줘.", "err");
    setMessage("상품 조회 실패. 네트워크 확인 후 다시 스캔하거나 직접 입력해줘.", "err");
  }
}

function buildReportPayload() {
  const inspected = Number($("totalInspectedQty").value || 0);
  const defect = Number($("totalDefectQty").value || 0);
  return {
    report_no: `FIELD-${Date.now()}`,
    lookup_source: lastLookupProduct?.lookup_source || ($("barcode").value.trim() ? "barcode" : "manual"),
    barcode: $("barcode").value.trim() || null,
    vendor_item_id: lastLookupProduct?.vendor_item_id || null,
    product_id: lastLookupProduct?.product_id || null,
    sku_id: lastLookupProduct?.sku_id || null,
    supplier_name_snapshot: $("supplierName").value.trim() || null,
    product_name_snapshot: $("productName").value.trim(),
    option_name_snapshot: $("optionName").value.trim() || null,
    product_snapshot_json: lastLookupProduct?.product_snapshot_json || {
      barcode: $("barcode").value.trim() || null,
      supplier_name: $("supplierName").value.trim() || null,
      product_name: $("productName").value.trim(),
      option_name: $("optionName").value.trim() || null,
      source: "field-defect-app"
    },
    site_name: $("siteName").value.trim() || null,
    inspector_name: $("inspectorName").value.trim(),
    field_device_label: $("deviceLabel").value.trim() || null,
    inspection_date: $("inspectionDate").value || today,
    total_inspected_qty: inspected,
    total_defect_qty: defect,
    status: "submitted",
    memo: $("memo").value.trim() || null
  };
}

async function uploadPhotos(reportId) {
  const rows = [];
  for (let index = 0; index < selectedFiles.length; index += 1) {
    const file = selectedFiles[index];
    const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const storagePath = `${reportId}/${Date.now()}-${index}.${extension}`;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg"
    });
    if (uploadError) throw uploadError;

    rows.push({
      report_id: reportId,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      original_file_name: file.name,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      sort_order: index + 1
    });
  }

  const { data, error } = await client.from("defect_photos").insert(rows).select("id, report_id, storage_path");
  if (error) throw error;
  return data;
}

async function saveDefectItem(reportId, firstPhotoId) {
  const totalDefectQty = Number($("totalDefectQty").value || 0);
  const defectItemQty = Number($("defectItemQty").value || totalDefectQty || 1);
  const payload = {
    report_id: reportId,
    photo_id: firstPhotoId,
    defect_type: selectedType,
    defect_detail: selectedType === "기타" ? $("defectDetail").value.trim() : null,
    defect_qty: defectItemQty,
    memo: $("memo").value.trim() || null
  };
  const { error } = await client.from("defect_items").insert(payload);
  if (error) throw error;
}

async function markReportUploadFailed(reportId, error) {
  try {
    await client
      .from("defect_reports")
      .update({
        status: "upload_failed",
        memo: `저장 중 일부 실패: ${error.message || "unknown"}`
      })
      .eq("id", reportId);
  } catch (markError) {
    console.error("failed to mark upload_failed", markError);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  let savedReportId = null;
  try {
    validateForm();
    setBusy(true);
    setMessage("");
    localStorage.setItem("inspectorName", $("inspectorName").value.trim());
    localStorage.setItem("siteName", $("siteName").value.trim());
    localStorage.setItem("fieldDeviceLabel", $("deviceLabel").value.trim());

    const { data: report, error: reportError } = await client
      .from("defect_reports")
      .insert(buildReportPayload())
      .select("id, report_no")
      .single();
    if (reportError) throw reportError;
    savedReportId = report.id;

    const photos = await uploadPhotos(report.id);
    await saveDefectItem(report.id, photos[0].id);

    setMessage(`저장 완료: ${report.report_no}`, "ok");
    $("defectForm").reset();
    $("inspectionDate").value = today;
    $("inspectorName").value = localStorage.getItem("inspectorName") || "";
    $("siteName").value = localStorage.getItem("siteName") || "";
    $("deviceLabel").value = localStorage.getItem("fieldDeviceLabel") || "";
    selectedFiles = [];
    selectedType = "제품불량";
    lastLookupProduct = null;
    setLookupMessage("바코드를 스캔하거나 직접 입력 후 Enter를 눌러줘.");
    $("defectDetailBox").hidden = true;
    renderPreview();
    renderTypeButtons();
    updateRate();
  } catch (error) {
    console.error(error);
    if (savedReportId) {
      await markReportUploadFailed(savedReportId, error);
    }
    setMessage(error.message || "저장 실패. 다시 확인해줘.", "err");
  } finally {
    setBusy(false);
  }
}

async function startBarcodeScanner() {
  try {
    $("scannerPanel").hidden = false;
    $("scannerHint").textContent = "카메라 준비 중...";
    const { BrowserMultiFormatReader } = await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
    scannerReader = scannerReader || new BrowserMultiFormatReader();
    scannerControls = await scannerReader.decodeFromVideoDevice(
      undefined,
      "scannerVideo",
      (result, error, controls) => {
        scannerControls = controls;
        if (!result) return;
        const code = result.getText();
        $("barcode").value = code;
        $("barcode").dispatchEvent(new Event("input", { bubbles: true }));
        setLookupMessage(`바코드 스캔 완료: ${code}. 상품 조회 중...`, "ok");
        setMessage(`바코드 스캔 완료: ${code}`, "ok");
        stopBarcodeScanner();
        lookupProductByBarcode();
      }
    );
    $("scannerHint").textContent = "바코드를 화면 중앙에 맞춰줘. 인식되면 자동 입력돼.";
  } catch (error) {
    console.error(error);
    stopBarcodeScanner();
    $("barcode").focus();
    setLookupMessage("카메라 스캔을 열 수 없어. 직접 입력창에 바코드를 넣어줘.", "err");
    setMessage("카메라 스캔을 열 수 없어. 권한 확인 후 다시 누르거나 바코드를 직접 입력해줘.", "err");
  }
}

function stopBarcodeScanner() {
  if (scannerControls) {
    scannerControls.stop();
    scannerControls = null;
  }
  const video = $("scannerVideo");
  if (video?.srcObject) {
    video.srcObject.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
  $("scannerPanel").hidden = true;
}

$("scanBarcode").addEventListener("click", startBarcodeScanner);
$("barcode").addEventListener("change", lookupProductByBarcode);
$("barcode").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupProductByBarcode();
  }
});
$("closeScanner").addEventListener("click", stopBarcodeScanner);
$("totalInspectedQty").addEventListener("input", updateRate);
$("totalDefectQty").addEventListener("input", updateRate);
$("photos").addEventListener("change", (event) => {
  selectedFiles = [...event.target.files];
  const oversizedFile = selectedFiles.find((file) => file.size > MAX_PHOTO_SIZE_BYTES);
  if (oversizedFile) {
    selectedFiles = [];
    event.target.value = "";
    renderPreview();
    setMessage(`${oversizedFile.name} 파일이 10MB를 넘어. 다른 사진을 선택해줘.`, "err");
    return;
  }
  renderPreview();
  setMessage(`${selectedFiles.length}장 선택됨`, "ok");
});
$("defectForm").addEventListener("submit", handleSubmit);

renderTypeButtons();
updateRate();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(console.error);
}
