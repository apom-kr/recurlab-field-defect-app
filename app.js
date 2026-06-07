const SUPABASE_URL = "https://rlsdcgwldfpqhdwqrdpp.supabase.co";
const SUPABASE_KEY = "eyJhbG...2ylw";
const BUCKET = "defect-photos";
const DEFECT_TYPES = ["제품불량", "포장불량", "라벨불량", "수량오류", "오염", "파손", "기타"];
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);

let defectItems = [];
let scannerControls = null;
let scannerReader = null;
let lastLookupProduct = null;
let lastLookupBarcode = "";
let lookupRequestSeq = 0;
const DRAFT_KEY = "fieldDefectDraftV1";
const DRAFT_FIELDS = ["barcode", "supplierName", "productName", "optionName", "inspectorName", "siteName", "inspectionDate", "totalInspectedQty", "memo"];

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

function setConnectionStatus(text, type = "") {
  const status = $("connectionStatus");
  status.textContent = text;
  status.className = `status-card ${type}`;
}

function refreshConnectionStatus() {
  if (!navigator.onLine) {
    setConnectionStatus("오프라인", "err");
    return;
  }
  setConnectionStatus("저장 준비", "");
}

function setBusy(isBusy) {
  $("submitBtn").disabled = isBusy;
  $("submitBtn").textContent = isBusy ? "저장 중" : "불량 기록 저장";
  if (isBusy) {
    setConnectionStatus("저장 중", "busy");
  } else {
    refreshConnectionStatus();
  }
}

function createDefectItem() {
  return {
    id: crypto.randomUUID(),
    type: DEFECT_TYPES[0],
    qty: "",
    files: []
  };
}

function getDefectQtyTotal() {
  return defectItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function getPhotoCountTotal() {
  return defectItems.reduce((sum, item) => sum + item.files.length, 0);
}

function updateRate() {
  const inspected = Number($("totalInspectedQty").value || 0);
  const defect = getDefectQtyTotal();
  $("totalDefectQty").textContent = `${defect}개`;
  $("photoSummary").textContent = getPhotoCountTotal() ? `${getPhotoCountTotal()}장` : "사진 없음";
  const rate = inspected > 0 ? (defect / inspected) * 100 : 0;
  $("defectRate").textContent = `${rate.toFixed(1)}%`;
}

function saveDraft() {
  const draft = DRAFT_FIELDS.reduce((acc, id) => {
    acc[id] = $(id)?.value || "";
    return acc;
  }, {});
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    DRAFT_FIELDS.forEach((id) => {
      if (draft[id] !== undefined && $(id)) $(id).value = draft[id];
    });
    setMessage("이전에 입력하던 내용을 불러왔습니다. 불량 항목과 사진은 다시 추가해주세요.");
  } catch (error) {
    console.warn("draft restore failed", error);
    localStorage.removeItem(DRAFT_KEY);
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function buildTypeSelect(item) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", "불량 내용");
  DEFECT_TYPES.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
  select.value = item.type;
  select.addEventListener("change", () => {
    item.type = select.value;
    saveDraft();
  });
  return select;
}

function buildQtyInput(item) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.inputMode = "numeric";
  input.placeholder = "수량";
  input.setAttribute("aria-label", "불량 수량");
  input.value = item.qty;
  input.addEventListener("input", () => {
    item.qty = input.value;
    updateRate();
    saveDraft();
  });
  return input;
}

function renderItemPhotos(item, photoWrap) {
  photoWrap.innerHTML = "";
  item.files.forEach((file) => {
    const img = document.createElement("img");
    img.alt = file.name;
    img.src = URL.createObjectURL(file);
    photoWrap.appendChild(img);
  });
}

function handleItemPhotos(item, input, photoWrap) {
  const newFiles = [...input.files];
  const oversizedFile = newFiles.find((file) => file.size > MAX_PHOTO_SIZE_BYTES);
  if (oversizedFile) {
    input.value = "";
    setMessage(`${oversizedFile.name} 파일이 10MB를 초과합니다. 다른 사진을 선택해주세요.`, "err");
    return;
  }
  item.files = [...item.files, ...newFiles];
  input.value = "";
  renderItemPhotos(item, photoWrap);
  updateRate();
  setMessage(`${item.type} 사진 ${item.files.length}장`, "ok");
}

function renderDefectItems() {
  const list = $("defectItems");
  list.innerHTML = "";
  defectItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "defect-item";

    const head = document.createElement("div");
    head.className = "defect-item-head";
    const title = document.createElement("strong");
    title.textContent = `불량 ${index + 1}`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "small-btn";
    removeBtn.textContent = "삭제";
    removeBtn.hidden = defectItems.length === 1;
    removeBtn.addEventListener("click", () => {
      defectItems = defectItems.filter((target) => target.id !== item.id);
      renderDefectItems();
      updateRate();
      saveDraft();
    });
    head.append(title, removeBtn);

    const fields = document.createElement("div");
    fields.className = "defect-fields";
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "불량 내용";
    typeLabel.appendChild(buildTypeSelect(item));
    const qtyLabel = document.createElement("label");
    qtyLabel.textContent = "수량";
    qtyLabel.appendChild(buildQtyInput(item));
    fields.append(typeLabel, qtyLabel);

    const photoLabel = document.createElement("label");
    photoLabel.className = "photo-drop item-photo-drop";
    const photoInput = document.createElement("input");
    photoInput.type = "file";
    photoInput.accept = "image/*";
    photoInput.capture = "environment";
    photoInput.multiple = true;
    const photoText = document.createElement("span");
    photoText.textContent = "사진 추가";
    const photoHint = document.createElement("small");
    photoHint.textContent = "위 불량 내용의 증거 사진";
    photoLabel.append(photoInput, photoText, photoHint);

    const photoWrap = document.createElement("div");
    photoWrap.className = "item-photos";
    renderItemPhotos(item, photoWrap);
    photoInput.addEventListener("change", () => handleItemPhotos(item, photoInput, photoWrap));

    card.append(head, fields, photoLabel, photoWrap);
    list.appendChild(card);
  });
  updateRate();
}

function addDefectItem() {
  defectItems.push(createDefectItem());
  renderDefectItems();
  saveDraft();
}

function resetDefectItems() {
  defectItems = [createDefectItem()];
  renderDefectItems();
}

function validateDefectItems(inspected) {
  const defect = getDefectQtyTotal();
  const emptyItem = defectItems.find((item) => !item.qty || Number(item.qty) <= 0 || !Number.isInteger(Number(item.qty)));
  if (emptyItem) {
    scrollToField("photoBlock");
    throw new Error("불량 항목별 수량을 입력해주세요.");
  }
  const noPhotoItem = defectItems.find((item) => item.files.length === 0);
  if (noPhotoItem) {
    scrollToField("photoBlock");
    throw new Error("각 불량 항목에 사진을 최소 1장 추가해주세요.");
  }
  if (defect > inspected) {
    scrollToField("photoBlock");
    throw new Error("불량 수량 합계는 검사 수량보다 클 수 없습니다.");
  }
}

function validateForm() {
  if (!navigator.onLine) {
    throw new Error("현재 오프라인입니다. 입력 내용은 임시 저장됩니다. 네트워크 연결 후 저장해주세요.");
  }
  const inspected = Number($("totalInspectedQty").value || 0);

  if (!$("productName").value.trim()) {
    scrollToField("productName");
    throw new Error("상품명을 입력해주세요.");
  }
  if (!$("inspectorName").value.trim()) {
    scrollToField("inspectorName");
    throw new Error("검사자 이름을 입력해주세요.");
  }
  if (!$("inspectionDate").value) {
    scrollToField("inspectionDate");
    throw new Error("검사일을 선택해주세요.");
  }
  if (inspected < 0) {
    scrollToField("totalInspectedQty");
    throw new Error("검사 수량은 0 이상이어야 합니다.");
  }
  if (!Number.isInteger(inspected)) {
    scrollToField("totalInspectedQty");
    throw new Error("검사 수량은 소수점 없이 정수로 입력해주세요.");
  }
  if (inspected <= 0) {
    scrollToField("totalInspectedQty");
    throw new Error("검사 수량은 1 이상이어야 합니다.");
  }
  validateDefectItems(inspected);
}

function applyProductLookup(product) {
  lastLookupProduct = product;
  lastLookupBarcode = $("barcode").value.trim();
  $("supplierName").value = product.supplier_name || "";
  $("productName").value = product.product_name || "";
  $("optionName").value = product.option_name || "";
  const optionText = product.option_name ? ` / 옵션: ${product.option_name}` : " / 옵션 없음, 필요 시 직접 확인";
  setLookupMessage(`상품 자동입력 완료: ${product.product_name}${optionText}`, "ok");
  setMessage(`상품 자동입력 완료: ${product.product_name}`, "ok");
}

function clearLookupProductIfManualEdit() {
  saveDraft();
  if (!lastLookupProduct) return;
  lastLookupProduct = null;
  lastLookupBarcode = "";
  setLookupMessage("상품 정보가 수정되었습니다. 현재 입력값을 직접 입력 상품으로 저장합니다.");
}

function getValidLookupProduct() {
  const currentBarcode = $("barcode").value.trim();
  if (!lastLookupProduct || currentBarcode !== lastLookupBarcode) return null;
  return lastLookupProduct;
}

async function lookupProductByBarcode() {
  const barcode = $("barcode").value.trim();
  if (!barcode) return;
  const requestSeq = lookupRequestSeq + 1;
  lookupRequestSeq = requestSeq;
  try {
    setLookupMessage("바코드 상품 조회 중...");
    setMessage("바코드 상품 조회 중...");
    $("scanBarcode").disabled = true;
    const { data, error } = await client.rpc("lookup_defect_product_by_barcode", { p_barcode: barcode });
    if (requestSeq !== lookupRequestSeq || barcode !== $("barcode").value.trim()) return;
    if (error) throw error;
    if (!data || data.length === 0) {
      lastLookupProduct = null;
      lastLookupBarcode = "";
      setLookupMessage("DB에서 상품을 찾지 못했습니다. 상품명을 직접 입력해주세요.", "err");
      setMessage("DB에서 상품을 찾지 못했습니다. 상품명을 직접 입력해주세요.", "err");
      scrollToField("productName");
      return;
    }
    applyProductLookup(data[0]);
  } catch (error) {
    console.error(error);
    lastLookupProduct = null;
    lastLookupBarcode = "";
    setLookupMessage("상품 조회 실패. 직접 입력으로 진행하거나 네트워크 확인 후 다시 시도해주세요.", "err");
    setMessage("상품 조회 실패. 네트워크 확인 후 다시 스캔하거나 직접 입력해주세요.", "err");
  } finally {
    $("scanBarcode").disabled = false;
  }
}

function buildReportPayload() {
  const inspected = Number($("totalInspectedQty").value || 0);
  const defect = getDefectQtyTotal();
  const lookupProduct = getValidLookupProduct();
  return {
    report_no: `FIELD-${Date.now()}`,
    lookup_source: lookupProduct?.lookup_source || ($("barcode").value.trim() ? "manual_barcode" : "manual"),
    barcode: $("barcode").value.trim() || null,
    vendor_item_id: lookupProduct?.vendor_item_id || null,
    product_id: lookupProduct?.product_id || null,
    sku_id: lookupProduct?.sku_id || null,
    supplier_name_snapshot: $("supplierName").value.trim() || null,
    product_name_snapshot: $("productName").value.trim(),
    option_name_snapshot: $("optionName").value.trim() || null,
    product_snapshot_json: lookupProduct?.product_snapshot_json || {
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
  const uploadedItems = [];
  let sortOrder = 1;
  for (const item of defectItems) {
    const uploadedPhotos = [];
    for (let index = 0; index < item.files.length; index += 1) {
      const file = item.files[index];
      const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const storagePath = `${reportId}/${Date.now()}-${item.id}-${index}.${extension}`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg"
      });
      if (uploadError) throw uploadError;

      uploadedPhotos.push({
        report_id: reportId,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        original_file_name: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        sort_order: sortOrder
      });
      sortOrder += 1;
    }

    const { data, error } = await client.from("defect_photos").insert(uploadedPhotos).select("id, report_id, storage_path");
    if (error) throw error;
    uploadedItems.push({ item, photos: data });
  }
  return uploadedItems;
}

async function saveDefectItems(reportId, uploadedItems) {
  const rows = uploadedItems.map(({ item, photos }) => ({
    report_id: reportId,
    photo_id: photos[0]?.id || null,
    defect_type: item.type || DEFECT_TYPES[0],
    defect_detail: null,
    defect_qty: Number(item.qty),
    memo: $("memo").value.trim() || null
  }));
  const { error } = await client.from("defect_items").insert(rows);
  if (error) throw error;
}

async function markReportUploadFailed(reportId, error) {
  try {
    await client
      .from("defect_reports")
      .update({ status: "upload_failed", memo: `저장 실패: ${error.message || error}` })
      .eq("id", reportId);
  } catch (markError) {
    console.error("failed to mark report upload failure", markError);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  let savedReportId = null;
  try {
    validateForm();
    saveDraft();
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

    const uploadedItems = await uploadPhotos(report.id);
    await saveDefectItems(report.id, uploadedItems);

    setMessage(`저장 완료: ${report.report_no}. 다음 상품을 바로 입력할 수 있습니다.`, "ok");
    clearDraft();
    $("defectForm").reset();
    $("inspectionDate").value = today;
    $("inspectorName").value = localStorage.getItem("inspectorName") || "";
    $("siteName").value = localStorage.getItem("siteName") || "";
    $("deviceLabel").value = localStorage.getItem("fieldDeviceLabel") || "";
    resetDefectItems();
    lastLookupProduct = null;
    lastLookupBarcode = "";
    setLookupMessage("");
    updateRate();
    scrollToField("barcode");
  } catch (error) {
    if (savedReportId) {
      console.error(error);
      await markReportUploadFailed(savedReportId, error);
      setMessage(`일부 저장 실패. 관리자에게 보고번호 ${savedReportId}와 함께 알려주세요.`, "err");
      return;
    }
    console.warn(error);
    saveDraft();
    setMessage(error.message || "저장 실패. 입력 내용을 다시 확인해주세요.", "err");
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
        if ($("barcode").value.trim() === code) return;
        const confirmed = !$("barcode").value.trim() || window.confirm("입력 중인 바코드를 스캔한 값으로 바꿀까요?");
        if (!confirmed) return;
        $("barcode").value = code;
        $("barcode").dispatchEvent(new Event("input", { bubbles: true }));
        setLookupMessage(`바코드 스캔 완료: ${code}. 상품 조회 중...`, "ok");
        setMessage(`바코드 스캔 완료: ${code}`, "ok");
        stopBarcodeScanner();
        lookupProductByBarcode();
      }
    );
    $("scannerHint").textContent = "바코드를 화면 중앙에 맞춰주세요. 인식되면 자동 입력됩니다.";
  } catch (error) {
    console.warn(error);
    stopBarcodeScanner();
    $("barcode").focus();
    setLookupMessage("카메라 스캔을 열 수 없습니다. 직접 입력창에 바코드를 입력해주세요.", "err");
    setMessage("카메라 스캔을 열 수 없습니다. 권한 확인 후 다시 누르거나 바코드를 직접 입력해주세요.", "err");
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
$("barcode").addEventListener("input", () => {
  lookupRequestSeq += 1;
  if ($("barcode").value.trim() !== lastLookupBarcode) clearLookupProductIfManualEdit();
  saveDraft();
});
$("barcode").addEventListener("change", lookupProductByBarcode);
$("barcode").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupProductByBarcode();
  }
});
$("closeScanner").addEventListener("click", stopBarcodeScanner);
$("supplierName").addEventListener("input", clearLookupProductIfManualEdit);
$("productName").addEventListener("input", clearLookupProductIfManualEdit);
$("optionName").addEventListener("input", clearLookupProductIfManualEdit);
DRAFT_FIELDS.filter((id) => !["barcode", "supplierName", "productName", "optionName"].includes(id)).forEach((id) => {
  $(id)?.addEventListener("input", saveDraft);
});
$("totalInspectedQty").addEventListener("input", updateRate);
$("addDefectItem").addEventListener("click", addDefectItem);
$("defectForm").addEventListener("submit", handleSubmit);

window.addEventListener("online", refreshConnectionStatus);
window.addEventListener("offline", refreshConnectionStatus);
loadDraft();
resetDefectItems();
updateRate();
refreshConnectionStatus();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(console.error);
}
