const API = window.location.origin && window.location.origin !== "null"
  ? window.location.origin
  : "http://localhost:3000";
const state = { products: [], orders: [] };
const DEFAULT_SHOP_LOGO = "/uploads/logogusa.jpg";
const DEFAULT_PUBLIC_SHOP_URL = "";
const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 12;
const CLIENT_IMAGE_MAX_DIMENSION_PX = 2000;
const CLIENT_IMAGE_MIN_COMPRESS_BYTES = 700 * 1024;
const CLIENT_IMAGE_QUALITY_STEPS = [0.92, 0.9, 0.88, 0.86];
let productSortable = null;
const FIXED_PRODUCT_CATEGORIES = [
  "LINEN TƯNG",
  "LINEN TƯNG HỌA TIẾT",
  "LINEN TƯNG MÀU",
  "LINEN TƠ",
  "LINEN TƠ HỌA TIẾT",
  "LINEN TƠ MÀU",
  "LINEN ƯỚT",
  "LINEN BỐ SỚ XÉO",
  "LINEN TẰM GÂN THÊU"
];
const CATEGORY_GROUPS = [
  {
    parent: "LINEN TƯNG",
    children: ["LINEN TƯNG HỌA TIẾT", "LINEN TƯNG MÀU"]
  },
  {
    parent: "LINEN TƠ",
    children: ["LINEN TƠ HỌA TIẾT", "LINEN TƠ MÀU"]
  }
];
let variantRowsData = [];
let shopPublicUrl = DEFAULT_PUBLIC_SHOP_URL;
let uploadMaxFileSizeMb = DEFAULT_UPLOAD_MAX_FILE_SIZE_MB;
let productInsightsMode = "fast";
let productCategories = [...FIXED_PRODUCT_CATEGORIES];
const PRODUCT_PAGE_SIZE = 20;
const ORDER_PAGE_SIZE = 20;
const MAX_PAGE_BUTTONS = 7;
const paginationState = {
  products: 1,
  orders: 1
};

function normalizeCategoryLabel(value) {
  const next = String(value || "").trim().replace(/\s+/g, " ");
  return next;
}

function getCategoryOptions() {
  return [...productCategories];
}

function getSelectableCategoryOptions(categories = getCategoryOptions()) {
  const { grouped, remaining } = buildCategoryGrouping(categories);
  return [
    ...grouped.flatMap((group) => group.children),
    ...remaining
  ];
}

function getDefaultCategoryValue(categories = getCategoryOptions()) {
  const selectable = getSelectableCategoryOptions(categories);
  return selectable[0] || categories[0] || "Khác";
}

function buildCategoryGrouping(categories) {
  const normalized = categories.map((item) => normalizeCategoryLabel(item)).filter(Boolean);
  const used = new Set();

  const grouped = CATEGORY_GROUPS.map((group) => {
    const parent = normalized.find((item) => normalizeCategoryKey(item) === normalizeCategoryKey(group.parent)) || group.parent;
    used.add(normalizeCategoryKey(parent));

    const children = group.children
      .map((child) => normalized.find((item) => normalizeCategoryKey(item) === normalizeCategoryKey(child)) || child)
      .filter((value, index, array) => array.findIndex((item) => normalizeCategoryKey(item) === normalizeCategoryKey(value)) === index);

    children.forEach((child) => used.add(normalizeCategoryKey(child)));

    return { parent, children };
  });

  const remaining = normalized.filter((item) => !used.has(normalizeCategoryKey(item)));

  return { grouped, remaining };
}

function renderCategorySelectOptions() {
  const select = document.getElementById("category");
  if (!select) return;

  const selected = normalizeCategoryLabel(select.value);
  const options = getCategoryOptions();

  const { grouped, remaining } = buildCategoryGrouping(options);

  const groupedHtml = grouped.map((group) => {
    const childrenHtml = group.children
      .map((child) => `<option value="${child.replace(/"/g, "&quot;")}">${child}</option>`)
      .join("");

    return `
      <optgroup label="${group.parent.replace(/"/g, "&quot;")}">
        ${childrenHtml}
      </optgroup>
    `;
  }).join("");

  const remainingHtml = remaining
    .map((category) => `<option value="${category.replace(/"/g, "&quot;")}">${category}</option>`)
    .join("");

  select.innerHTML = `${groupedHtml}${remainingHtml}`;

  const selectableOptions = getSelectableCategoryOptions(options);
  const fallback = getDefaultCategoryValue(options);
  const hasSelected = selectableOptions.some((item) => normalizeCategoryKey(item) === normalizeCategoryKey(selected));
  select.value = hasSelected ? selected : fallback;
}

function renderCategoryNav() {
  const container = document.getElementById("categoryNavLinks");
  if (!container) return;

  const categories = getCategoryOptions();
  const { grouped, remaining } = buildCategoryGrouping(categories);

  const groupedLinks = grouped.map((group) => {
    const childrenLinks = group.children.map((child) => {
      const href = `/admin.html?category=${encodeURIComponent(child)}`;
      return `<a class="nav-submenu-link" data-category="${child.replace(/"/g, "&quot;")}" href="${href}">${child}</a>`;
    }).join("");

    return `
      <div class="nav-submenu-group">
        <div class="nav-submenu-parent">${group.parent}</div>
        <div class="nav-submenu-children">${childrenLinks}</div>
      </div>
    `;
  }).join("");

  const remainingLinks = remaining.map((category) => {
    const href = `/admin.html?category=${encodeURIComponent(category)}`;
    return `<a class="nav-submenu-link" data-category="${category.replace(/"/g, "&quot;")}" href="${href}">${category}</a>`;
  }).join("");

  container.innerHTML = `${groupedLinks}${remainingLinks}<a class="nav-submenu-link" data-category="" href="/admin.html">Tất cả</a>`;
}

function syncCategoryUi() {
  renderCategoryNav();
  renderCategorySelectOptions();
  setupCategoryNavLinks();
  updateCategoryNavActive();
}

function sanitizeOrigin(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return "";
  }
}

function getShopBaseOrigin() {
  const host = String(window.location.hostname || "").toLowerCase();
  // In production, always keep admin/shop on the same domain to avoid stale links to old services.
  if (host !== "localhost" && host !== "127.0.0.1") {
    return window.location.origin;
  }

  return sanitizeOrigin(shopPublicUrl) || window.location.origin;
}

function parseColorStockInput(value) {
  const qty = Number(String(value || "").trim().replace(",", "."));
  if (!Number.isFinite(qty) || qty < 0) return null;
  return Math.round(qty * 100) / 100;
}

function formatStockInputValue(value) {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty < 0) return "";
  return String((Math.round(qty * 100) / 100)).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function parseVariantLengthInput(value) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) return null;
  const length = Number(normalized);
  if (!Number.isFinite(length) || length <= 0) return null;
  return Math.round(length * 100) / 100;
}

function parseVariantPriceInput(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount);
}

function showMissingFieldsToast(fields) {
  const missingFields = Array.isArray(fields)
    ? fields.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!missingFields.length) return false;
  const message = `Chưa điền đủ: ${missingFields.join(", ")}`;
  if (!setProductFormAlert(message)) {
    showToast(message);
  }
  return true;
}

function setProductFormAlert(message) {
  const alertEl = document.getElementById("productFormAlert");
  if (!alertEl) return false;

  const nextMessage = String(message || "").trim();
  if (!nextMessage) {
    alertEl.textContent = "";
    alertEl.classList.remove("show");
    alertEl.classList.remove("shake");
    return true;
  }

  alertEl.textContent = `⚠️ ${nextMessage}`;
  alertEl.classList.add("show");
  alertEl.classList.remove("shake");
  void alertEl.offsetWidth;
  alertEl.classList.add("shake");
  return true;
}

function clearProductFormAlert() {
  setProductFormAlert("");
}

async function readApiResponseSafely(res) {
  const raw = await res.text();
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  const requestId = String(
    res.headers.get("x-request-id")
      || res.headers.get("cf-ray")
      || ""
  ).trim();
  const isHtmlResponse = contentType.includes("text/html") || /<!doctype html|<html[\s>]/i.test(raw || "");
  let data = {};

  if (!isHtmlResponse) {
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      data = {};
    }
  }

  return { raw, data, isHtmlResponse, requestId };
}

function getApiErrorMessage(res, raw, data, fallback, requestId = "") {
  const responseRequestId = String(requestId || data?.requestId || "").trim();
  const appendRequestId = (message) => responseRequestId ? `${message} (mã: ${responseRequestId})` : message;

  if (data && typeof data.error === "string" && data.error.trim()) {
    return appendRequestId(data.error.trim());
  }

  const isGatewayError = Number(res?.status) === 502 || /cloudflare|bad gateway|host error/i.test(String(raw || ""));
  if (isGatewayError) {
    return appendRequestId("Server đang bị lỗi 502 (gateway/hosting), vui lòng thử lại sau ít phút");
  }

  const status = Number(res?.status);
  if (Number.isFinite(status) && status > 0) {
    return appendRequestId(`${fallback} (HTTP ${status})`);
  }

  return appendRequestId(fallback);
}

function formatVariantLength(length) {
  const safe = Number(length);
  if (!Number.isFinite(safe) || safe <= 0) return "";
  return safe.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function splitVariantNameAndLength(value) {
  const raw = String(value || "").trim();
  if (!raw) return { name: "", cutLength: null };

  const matched = raw.match(/^(.*)\((\d+(?:[\.,]\d+)?)\s*m\)\s*$/i);
  if (!matched) return { name: raw, cutLength: null };

  return {
    name: String(matched[1] || "").trim(),
    cutLength: parseVariantLengthInput(matched[2])
  };
}

function composeVariantName(row, index) {
  const name = String(row?.name || "").trim() || `Màu ${index + 1}`;
  const cutLength = parseVariantLengthInput(row?.cutLength);
  if (!Number.isFinite(cutLength)) return name;
  return `${name} (${formatVariantLength(cutLength)}m)`;
}

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function clampPage(page, totalPages) {
  const nextPage = Math.max(1, Math.floor(Number(page) || 1));
  return Math.min(nextPage, Math.max(1, Math.floor(Number(totalPages) || 1)));
}

function buildPageWindow(currentPage, totalPages) {
  const pageCount = Math.max(1, Math.floor(Number(totalPages) || 1));
  const current = clampPage(currentPage, pageCount);
  const windowSize = Math.min(MAX_PAGE_BUTTONS, pageCount);
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, current - half);
  let end = start + windowSize - 1;

  if (end > pageCount) {
    end = pageCount;
    start = Math.max(1, end - windowSize + 1);
  }

  const pages = [];
  for (let index = start; index <= end; index += 1) {
    pages.push(index);
  }

  return pages;
}

function setPaginationPage(kind, page) {
  paginationState[kind] = Math.max(1, Math.floor(Number(page) || 1));
}

function renderPagination(containerId, kind, totalItems, pageSize, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.max(1, Math.ceil(Math.max(0, Number(totalItems) || 0) / Math.max(1, Number(pageSize) || 1)));
  const currentPage = clampPage(paginationState[kind] || 1, totalPages);
  paginationState[kind] = currentPage;

  const pages = buildPageWindow(currentPage, totalPages);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  container.innerHTML = `
    <div class="table-pagination-info">Trang ${currentPage}/${totalPages} · ${Number(totalItems) || 0} mục</div>
    <div class="table-pagination-actions">
      <button type="button" class="table-pagination-btn" ${hasPrev ? "" : "disabled"} data-page="${currentPage - 1}">‹</button>
      ${pages.map((page) => `<button type="button" class="table-pagination-btn ${page === currentPage ? "active" : ""}" data-page="${page}">${page}</button>`).join("")}
      <button type="button" class="table-pagination-btn" ${hasNext ? "" : "disabled"} data-page="${currentPage + 1}">›</button>
    </div>
  `;

  container.querySelectorAll("[data-page]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      onPageChange(Number(button.dataset.page) || 1);
    });
  });
}

function isClientCompressibleImage(file) {
  const mime = String(file?.type || "").toLowerCase();
  return mime === "image/jpeg" || mime === "image/jpg";
}

function buildCompressedFileName(originalName, mimeType) {
  const source = String(originalName || "image.jpg");
  const stripped = source.replace(/\.[^.]+$/, "");
  const extension = /\.jpeg$/i.test(source) ? ".jpeg" : ".jpg";
  return `${stripped}${extension}`;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.toBlob !== "function") {
      resolve(null);
      return;
    }

    canvas.toBlob((blob) => {
      resolve(blob || null);
    }, mimeType, quality);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => reject(new Error("Không đọc được ảnh để tối ưu"));
    image.src = objectUrl;
  });
}

async function compressImageForUpload(file, maxBytes) {
  if (!file || !isClientCompressibleImage(file)) return file;

  let loaded;
  try {
    loaded = await loadImageFromFile(file);
  } catch (error) {
    return file;
  }

  try {
    const sourceWidth = Number(loaded.image?.naturalWidth || loaded.image?.width || 0);
    const sourceHeight = Number(loaded.image?.naturalHeight || loaded.image?.height || 0);
    if (!sourceWidth || !sourceHeight) return file;

    const scale = Math.min(1, CLIENT_IMAGE_MAX_DIMENSION_PX / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const resized = targetWidth !== sourceWidth || targetHeight !== sourceHeight;

    if (!resized && Number(file.size || 0) < CLIENT_IMAGE_MIN_COMPRESS_BYTES) {
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return file;

    context.drawImage(loaded.image, 0, 0, targetWidth, targetHeight);

    const outputMime = "image/jpeg";
    let bestBlob = null;

    for (const quality of CLIENT_IMAGE_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, outputMime, quality);
      if (!blob) continue;
      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= maxBytes) {
        bestBlob = blob;
        break;
      }
    }

    if (!bestBlob) return file;

    const shouldUseCompressed = resized || bestBlob.size < Number(file.size || 0) || Number(file.size || 0) > maxBytes;
    if (!shouldUseCompressed) return file;

    return new File([bestBlob], buildCompressedFileName(file.name, outputMime), {
      type: outputMime,
      lastModified: Date.now()
    });
  } finally {
    if (loaded?.objectUrl) {
      URL.revokeObjectURL(loaded.objectUrl);
    }
  }
}

function updateVariantFilesHint() {
  const hint = document.getElementById("imagesFilesHint");
  if (!hint) return;

  const totalRows = variantRowsData.length;
  const withImage = variantRowsData.filter((row) => Boolean(row.file || row.existingUrl)).length;

  if (!totalRows) {
    hint.textContent = "Mỗi dòng gồm ảnh, tên màu, chiều dài khúc (m), giá theo khổ và số mét tồn";
    return;
  }

  hint.textContent = `Đã tạo ${totalRows} dòng màu, có ảnh ở ${withImage} dòng`;
}

function createVariantRowData(name = "", existingUrl = "", colorStock = null, cutLength = null, variantPrice = null, variantOldPrice = null) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || "").trim(),
    existingUrl: String(existingUrl || "").trim(),
    colorStock: Number.isFinite(Number(colorStock)) ? Math.max(0, Math.round(Number(colorStock) * 100) / 100) : null,
    cutLength: parseVariantLengthInput(cutLength),
    variantPrice: parseVariantPriceInput(variantPrice),
    variantOldPrice: parseVariantPriceInput(variantOldPrice),
    file: null
  };
}

function getVariantPreviewUrl(row) {
  if (row.file) return URL.createObjectURL(row.file);
  return row.existingUrl || "https://placehold.co/88x88?text=No+Image";
}

function cleanupVariantObjectUrls() {
  document.querySelectorAll(".variant-image-preview[data-object-url='true']").forEach((img) => {
    URL.revokeObjectURL(img.src);
  });
}

function syncVariantNamesByIndex() {
  variantRowsData.forEach((row, index) => {
    if (!row.name) {
      row.name = `Màu ${index + 1}`;
    }
  });
}

function getVariantRowsTotalStock() {
  return variantRowsData.reduce((sum, row) => {
    const qty = Number(row?.colorStock);
    if (!Number.isFinite(qty) || qty < 0) return sum;
    return Math.round((sum + qty) * 100) / 100;
  }, 0);
}

function syncTotalStockInputFromRows() {
  const stockInput = document.getElementById("stock");
  if (!stockInput) return;

  const hasRowStock = variantRowsData.some((row) => Number.isFinite(Number(row?.colorStock)));
  if (!hasRowStock) return;

  stockInput.value = String(getVariantRowsTotalStock());
}

function renderVariantRows() {
  const container = document.getElementById("variantRows");
  if (!container) return;

  cleanupVariantObjectUrls();

  if (!variantRowsData.length) {
    container.innerHTML = '<div class="variant-empty">Chưa có màu nào. Bấm "Thêm màu" để tạo dòng mới.</div>';
    updateVariantFilesHint();
    syncTotalStockInputFromRows();
    return;
  }

  container.innerHTML = variantRowsData.map((row, index) => {
    const previewUrl = getVariantPreviewUrl(row);
    const isObjectUrl = row.file ? "true" : "false";
    return `
      <div class="variant-row" data-row-id="${row.id}">
        <div class="variant-row-image-col">
          <img class="variant-image-preview" data-object-url="${isObjectUrl}" src="${previewUrl}" alt="Ảnh màu ${index + 1}" loading="lazy" decoding="async" />
          <input type="file" class="variant-file-input" accept="image/*" onchange="onVariantFileChange('${row.id}', this)" />
        </div>
        <div class="variant-row-name-col">
          <div class="variant-field">
            <span class="variant-field-label">Tên màu</span>
            <input
              type="text"
              class="variant-name-input"
              value="${String(row.name || "").replace(/"/g, "&quot;")}" 
              placeholder="Tên màu (vd: Đen)"
              oninput="onVariantNameInput('${row.id}', this.value)"
            />
          </div>
          <div class="variant-field">
            <span class="variant-field-label">Chiều dài mỗi khúc (m)</span>
            <input
              type="text"
              class="variant-length-input"
              value="${Number.isFinite(Number(row.cutLength)) ? formatVariantLength(row.cutLength) : ""}"
              placeholder="Ví dụ: 2.7"
              oninput="onVariantLengthInput('${row.id}', this.value)"
            />
          </div>
          <div class="variant-field">
            <span class="variant-field-label">Giá khổ này (đ)</span>
            <input
              type="number"
              min="0"
              class="variant-price-input"
              value="${Number.isFinite(Number(row.variantPrice)) ? String(Math.max(0, Math.round(Number(row.variantPrice)))) : ""}"
              placeholder="Ví dụ: 390000"
              oninput="onVariantPriceInput('${row.id}', this.value)"
            />
          </div>
          <div class="variant-field">
            <span class="variant-field-label">Giá cũ khổ này (đ)</span>
            <input
              type="number"
              min="0"
              class="variant-old-price-input"
              value="${Number.isFinite(Number(row.variantOldPrice)) ? String(Math.max(0, Math.round(Number(row.variantOldPrice)))) : ""}"
              placeholder="Ví dụ: 120000"
              oninput="onVariantOldPriceInput('${row.id}', this.value)"
            />
          </div>
          <div class="variant-field">
            <span class="variant-field-label">Số mét tồn</span>
            <input
              type="text"
              class="variant-stock-input"
              value="${formatStockInputValue(row.colorStock)}"
              placeholder="Ví dụ: 2.6"
              oninput="onVariantStocksInput('${row.id}', this.value)"
            />
          </div>
        </div>
        <button type="button" class="variant-remove-btn" onclick="removeVariantRow('${row.id}')" title="Xóa dòng màu">✕</button>
      </div>
    `;
  }).join("");

  updateVariantFilesHint();
  syncTotalStockInputFromRows();
}

function addVariantRow(defaultName = "", existingUrl = "", defaultCutLength = null) {
  variantRowsData.push(createVariantRowData(defaultName, existingUrl, null, defaultCutLength, null, null));
  syncVariantNamesByIndex();
  renderVariantRows();
}

function removeVariantRow(rowId) {
  const before = variantRowsData.length;
  variantRowsData = variantRowsData.filter((row) => row.id !== rowId);
  if (before === variantRowsData.length) return;
  syncVariantNamesByIndex();
  renderVariantRows();
}

function onVariantFileChange(rowId, input) {
  const row = variantRowsData.find((item) => item.id === rowId);
  if (!row) return;

  const nextFile = input?.files?.[0] || null;
  if (!nextFile) return;

  row.file = nextFile;
  row.existingUrl = "";
  renderVariantRows();
}

function onVariantNameInput(rowId, value) {
  const row = variantRowsData.find((item) => item.id === rowId);
  if (!row) return;
  row.name = String(value || "").trimStart();
}

function onVariantLengthInput(rowId, value) {
  const row = variantRowsData.find((item) => item.id === rowId);
  if (!row) return;
  row.cutLength = parseVariantLengthInput(value);
}

function onVariantPriceInput(rowId, value) {
  const row = variantRowsData.find((item) => item.id === rowId);
  if (!row) return;
  row.variantPrice = parseVariantPriceInput(value);
}

function onVariantOldPriceInput(rowId, value) {
  const row = variantRowsData.find((item) => item.id === rowId);
  if (!row) return;
  row.variantOldPrice = parseVariantPriceInput(value);
}

function onVariantStocksInput(rowId, value) {
  const row = variantRowsData.find((item) => item.id === rowId);
  if (!row) return;
  row.colorStock = parseColorStockInput(value);
  syncTotalStockInputFromRows();
}

function getAdminCategory() {
  const category = new URLSearchParams(window.location.search).get("category") || "";
  return category.trim();
}

function normalizeCategoryKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getShopCategoryUrl(category) {
  const normalized = String(category || "").trim();
  const base = getShopBaseOrigin();
  return normalized
    ? `${base}/shop.html?category=${encodeURIComponent(normalized)}`
    : `${base}/shop.html`;
}

function getProductShopUrl(product) {
  const id = Number(product?.id);
  const base = getShopBaseOrigin();
  if (!Number.isFinite(id)) return `${base}/shop.html`;
  return `${base}/shop.html?productId=${encodeURIComponent(String(id))}`;
}

function updateCategoryNavActive() {
  const currentCategory = getAdminCategory();

  document.querySelectorAll(".nav-submenu-link").forEach((link) => {
    const linkUrl = new URL(link.href, window.location.href);
    const linkCategory = linkUrl.searchParams.get("category") || "";
    const normalizedLinkCategory = linkCategory.trim();
    const isActive = currentCategory
      ? normalizedLinkCategory === currentCategory
      : normalizedLinkCategory === "";

    link.classList.toggle("active", isActive);
  });
}

function setupCategoryNavLinks() {
  document.querySelectorAll(".nav-submenu-link").forEach((link) => {
    if (link.dataset.bound === "true") return;
    link.dataset.bound = "true";

    link.addEventListener("click", (event) => {
      event.preventDefault();
      const category = (link.dataset.category || "").trim();
      const targetUrl = category
        ? `/admin.html?category=${encodeURIComponent(category)}`
        : "/admin.html";

      window.location.assign(targetUrl);
    });
  });
}

function formatOrderTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function getOrderSubtotal(order) {
  const subtotal = Number(order?.subtotal);
  if (Number.isFinite(subtotal) && subtotal >= 0) return subtotal;

  const total = Number(order?.total || 0);
  const shippingFee = Number(order?.shippingFee);
  if (Number.isFinite(shippingFee) && shippingFee >= 0) {
    return Math.max(0, total - shippingFee);
  }

  return Math.max(0, total);
}

function getOrderShippingFee(order) {
  const shippingFee = Number(order?.shippingFee);
  if (Number.isFinite(shippingFee) && shippingFee >= 0) return shippingFee;

  const subtotal = getOrderSubtotal(order);
  if (subtotal <= 0) return 0;
  return subtotal < 1000000 ? 30000 : 35000;
}

function getOrderGrandTotal(order) {
  const subtotal = getOrderSubtotal(order);
  const shippingFee = getOrderShippingFee(order);
  return subtotal + shippingFee;
}

function getOrderItemCutLengthMeters(item) {
  const direct = Number(item?.variantCutLength ?? item?.cutLength);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.round(direct * 100) / 100;
  }

  const variantName = String(item?.variantName || "").trim();
  if (!variantName) return null;

  const matched = variantName.match(/\((\d+(?:[\.,]\d+)?)\s*m\)\s*$/i);
  if (!matched) return null;

  const parsed = Number(String(matched[1] || "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed * 100) / 100;
}

function formatMeterValue(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe <= 0) return "0";
  return safe.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function getOrderTotalMeters(order) {
  const items = Array.isArray(order?.items) ? order.items : [];

  const total = items.reduce((sum, item) => {
    const cutLength = getOrderItemCutLengthMeters(item);
    if (!Number.isFinite(cutLength) || cutLength <= 0) return sum;

    const qty = Math.max(0, Number(item?.qty) || 0);
    return sum + (qty * cutLength);
  }, 0);

  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round(total * 100) / 100;
}

function formatMoney(value) {
  return `${Math.max(0, Number(value) || 0).toLocaleString("vi-VN")}đ`;
}

function normalizePhoneIdentity(value) {
  let digits = String(value || "").replace(/\D+/g, "");
  if (digits.startsWith("84") && digits.length >= 10) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

function getOrderDayIdentity(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOrderDateParts(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear())
  };
}

function populateCustomerDataYearOptions(orders) {
  const daySelect = document.getElementById("customer-data-day");
  const monthSelect = document.getElementById("customer-data-month");
  const yearSelect = document.getElementById("customer-data-year");
  if (!daySelect || !monthSelect || !yearSelect) return;

  const currentDay = daySelect.value;
  const currentMonth = monthSelect.value;
  const currentValue = yearSelect.value;
  const years = [...new Set((Array.isArray(orders) ? orders : [])
    .map((order) => getOrderDateParts(order?.updatedAt || order?.createdAt)?.year || "")
    .filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  daySelect.innerHTML = '<option value="">Ngày: Tất cả</option>' + Array.from({ length: 31 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `<option value="${day}">${day}</option>`;
  }).join("");

  monthSelect.innerHTML = '<option value="">Tháng: Tất cả</option>' + Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `<option value="${month}">Tháng ${month}</option>`;
  }).join("");

  yearSelect.innerHTML = '<option value="">Năm: Tất cả</option>' + years
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");

  if (currentDay) {
    daySelect.value = currentDay;
  }

  if (currentMonth) {
    monthSelect.value = currentMonth;
  }

  if (years.includes(currentValue)) {
    yearSelect.value = currentValue;
  }
}

function populateProductInsightsDateOptions(orders) {
  const daySelect = document.getElementById("product-insights-day");
  const monthSelect = document.getElementById("product-insights-month");
  const yearSelect = document.getElementById("product-insights-year");
  if (!daySelect || !monthSelect || !yearSelect) return;

  const currentDay = daySelect.value;
  const currentMonth = monthSelect.value;
  const currentYear = yearSelect.value;
  const years = [...new Set((Array.isArray(orders) ? orders : [])
    .map((order) => getOrderDateParts(order?.updatedAt || order?.createdAt)?.year || "")
    .filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  daySelect.innerHTML = '<option value="">Ngày: Tất cả</option>' + Array.from({ length: 31 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `<option value="${day}">${day}</option>`;
  }).join("");

  monthSelect.innerHTML = '<option value="">Tháng: Tất cả</option>' + Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `<option value="${month}">Tháng ${month}</option>`;
  }).join("");

  yearSelect.innerHTML = '<option value="">Năm: Tất cả</option>' + years
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");

  if (currentDay) daySelect.value = currentDay;
  if (currentMonth) monthSelect.value = currentMonth;
  if (years.includes(currentYear)) yearSelect.value = currentYear;
}

function buildCustomerDataRecords(orders) {
  const grouped = new Map();

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const phone = normalizePhoneIdentity(order?.phone);
    const fallbackKey = `${String(order?.customer || "Khách lẻ").trim().toLowerCase()}__${String(order?.address || "").trim().toLowerCase()}`;
    const key = phone || fallbackKey;
    if (!key) return;

    const totalSpent = getOrderGrandTotal(order);
    const orderTime = new Date(order?.updatedAt || order?.createdAt || 0).getTime();
    const products = Array.isArray(order?.items) ? order.items : [];

    const existing = grouped.get(key) || {
      key,
      customer: String(order?.customer || "Khách lẻ").trim() || "Khách lẻ",
      phone: String(order?.phone || "").trim() || "Chưa có số",
      address: String(order?.address || "").trim() || "Chưa có địa chỉ",
      ordersCount: 0,
      totalSpent: 0,
      latestAt: order?.updatedAt || order?.createdAt || "",
      latestTime: Number.isFinite(orderTime) ? orderTime : 0,
      productTokens: new Set(),
      productPills: []
    };

    existing.ordersCount += 1;
    existing.totalSpent += totalSpent;

    products.forEach((item) => {
      const name = String(item?.name || "").trim();
      const sku = String(item?.sku || "").trim();
      const variant = String(item?.variantName || "").trim();
      const qty = Math.max(0, Number(item?.qty) || 0);
      const token = `${sku}||${name}||${variant}`.toLowerCase();
      if (!token || existing.productTokens.has(token)) return;
      existing.productTokens.add(token);

      const labelParts = [];
      if (sku) labelParts.push(sku);
      if (name) labelParts.push(name);
      if (variant) labelParts.push(variant);

      existing.productPills.push({
        label: labelParts.join(" - ") || "Sản phẩm không rõ tên",
        qty
      });
    });

    if (Number.isFinite(orderTime) && orderTime >= existing.latestTime) {
      existing.latestTime = orderTime;
      existing.latestAt = order?.updatedAt || order?.createdAt || existing.latestAt;
      existing.customer = String(order?.customer || existing.customer).trim() || existing.customer;
      existing.phone = String(order?.phone || existing.phone).trim() || existing.phone;
      existing.address = String(order?.address || existing.address).trim() || existing.address;
    }

    grouped.set(key, existing);
  });

  return [...grouped.values()]
    .map((customer) => ({
      ...customer,
      searchText: [customer.customer, customer.phone, customer.address, ...customer.productPills.map((item) => item.label)]
        .join(" ")
        .toLowerCase()
    }))
    .sort((a, b) => b.latestTime - a.latestTime || b.totalSpent - a.totalSpent || b.ordersCount - a.ordersCount);
}

function buildProductInsightsRecords(orders) {
  const grouped = new Map();

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const orderTimeValue = order?.updatedAt || order?.createdAt || "";
    const orderTime = new Date(orderTimeValue).getTime();
    const orderId = Number(order?.id) || String(order?.id || orderTimeValue);

    (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
      const sku = String(item?.sku || "").trim() || "Chưa có SKU";
      const name = String(item?.name || "Sản phẩm").trim() || "Sản phẩm";
      const category = String(item?.category || "Khác").trim() || "Khác";
      const variant = String(item?.variantName || "").trim();
      const key = `${sku}||${name}||${category}`.toLowerCase();
      const qty = Math.max(0, Number(item?.qty) || 0);

      const existing = grouped.get(key) || {
        key,
        sku,
        name,
        category,
        totalQty: 0,
        latestAt: orderTimeValue,
        latestTime: Number.isFinite(orderTime) ? orderTime : 0,
        orderIds: new Set(),
        variants: new Set()
      };

      existing.totalQty += qty;
      existing.orderIds.add(orderId);
      if (variant) existing.variants.add(variant);

      if (Number.isFinite(orderTime) && orderTime >= existing.latestTime) {
        existing.latestTime = orderTime;
        existing.latestAt = orderTimeValue;
      }

      grouped.set(key, existing);
    });
  });

  return [...grouped.values()]
    .map((product) => ({
      ...product,
      orderCount: product.orderIds.size,
      variants: [...product.variants],
      searchText: [product.sku, product.name, product.category, ...product.variants].join(" ").toLowerCase()
    }));
}

function setProductInsightsMode(mode) {
  productInsightsMode = mode === "slow" ? "slow" : "fast";
  document.querySelectorAll(".product-insights-mode-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === productInsightsMode);
  });
  renderProductInsightsView();
}

function renderCustomerDataView() {
  const searchValue = (document.getElementById("customer-data-search")?.value || "").trim().toLowerCase();
  const selectedDay = document.getElementById("customer-data-day")?.value || "";
  const selectedMonth = document.getElementById("customer-data-month")?.value || "";
  const selectedYear = document.getElementById("customer-data-year")?.value || "";

  const filteredOrders = (Array.isArray(state.orders) ? state.orders : []).filter((order) => {
    const parts = getOrderDateParts(order?.updatedAt || order?.createdAt);
    if (!parts) return false;
    if (selectedDay && parts.day !== selectedDay) return false;
    if (selectedMonth && parts.month !== selectedMonth) return false;
    if (selectedYear && parts.year !== selectedYear) return false;
    return true;
  });

  const records = buildCustomerDataRecords(filteredOrders).filter((customer) => {
    if (!searchValue) return true;
    return customer.searchText.includes(searchValue);
  });

  const totalCustomersEl = document.getElementById("customerDataTotalCustomers");
  const selectedYearEl = document.getElementById("customerDataSelectedYear");
  const list = document.getElementById("customer-data-list");

  if (totalCustomersEl) totalCustomersEl.textContent = String(records.length);
  if (selectedYearEl) selectedYearEl.textContent = selectedYear || "Tất cả";

  if (!list) return;

  if (!records.length) {
    list.innerHTML = '<tr><td colspan="4">Không có dữ liệu khách hàng phù hợp bộ lọc</td></tr>';
    return;
  }

  list.innerHTML = records.map((customer) => `
    <tr>
      <td class="customer-data-name-cell">${customer.customer}</td>
      <td class="customer-data-phone-cell">${customer.phone}</td>
      <td class="customer-data-address-cell">${customer.address}</td>
      <td class="customer-data-time-cell">${formatOrderTime(customer.latestAt)}</td>
    </tr>
  `).join("");
}

function renderProductInsightsView() {
  const searchValue = (document.getElementById("product-insights-search")?.value || "").trim().toLowerCase();
  const selectedDay = document.getElementById("product-insights-day")?.value || "";
  const selectedMonth = document.getElementById("product-insights-month")?.value || "";
  const selectedYear = document.getElementById("product-insights-year")?.value || "";

  const filteredOrders = (Array.isArray(state.orders) ? state.orders : []).filter((order) => {
    const parts = getOrderDateParts(order?.updatedAt || order?.createdAt);
    if (!parts) return false;
    if (selectedDay && parts.day !== selectedDay) return false;
    if (selectedMonth && parts.month !== selectedMonth) return false;
    if (selectedYear && parts.year !== selectedYear) return false;
    return true;
  });

  const records = buildProductInsightsRecords(filteredOrders).filter((product) => {
    if (!searchValue) return true;
    return product.searchText.includes(searchValue);
  }).sort((a, b) => {
    if (productInsightsMode === "slow") {
      return a.totalQty - b.totalQty || a.orderCount - b.orderCount || a.latestTime - b.latestTime;
    }

    return b.totalQty - a.totalQty || b.orderCount - a.orderCount || b.latestTime - a.latestTime;
  });

  const totalProductsEl = document.getElementById("productInsightsTotalProducts");
  const totalQtyEl = document.getElementById("productInsightsTotalQty");
  const topSkuEl = document.getElementById("productInsightsTopSku");
  const topSkuLabelEl = document.getElementById("productInsightsTopSkuLabel");
  const selectedYearEl = document.getElementById("productInsightsSelectedYear");
  const list = document.getElementById("product-insights-list");

  if (totalProductsEl) totalProductsEl.textContent = String(records.length);
  if (totalQtyEl) totalQtyEl.textContent = String(records.reduce((sum, item) => sum + item.totalQty, 0));
  if (topSkuEl) topSkuEl.textContent = records[0]?.sku || "-";
  if (topSkuLabelEl) topSkuLabelEl.textContent = productInsightsMode === "slow" ? "SKU bán chậm nhất" : "SKU bán chạy nhất";
  if (selectedYearEl) selectedYearEl.textContent = selectedYear || "Tất cả";

  if (!list) return;

  if (!records.length) {
    list.innerHTML = '<tr><td colspan="5">Không có dữ liệu sản phẩm phù hợp bộ lọc</td></tr>';
    return;
  }

  list.innerHTML = records.map((product) => `
    <tr>
      <td class="product-insights-sku-cell">${product.sku}</td>
      <td class="product-insights-name-cell">
        <div class="product-insights-name-wrap">
          <strong>${product.name}</strong>
          ${product.variants.length ? `<span>${product.variants.slice(0, 2).join(" • ")}</span>` : ""}
        </div>
      </td>
      <td class="product-insights-category-cell">${product.category}</td>
      <td class="product-insights-qty-cell">${product.totalQty}</td>
      <td class="product-insights-time-cell">${formatOrderTime(product.latestAt)}</td>
    </tr>
  `).join("");
}

function resetProductForm() {
  const currentCategory = getAdminCategory();
  const name = document.getElementById("name");
  const sku = document.getElementById("sku");
  const stock = document.getElementById("stock");
  const category = document.getElementById("category");
  const imageUrl = document.getElementById("imageUrl");
  const modalTitle = document.getElementById("modal-title");
  const saveBtn = document.querySelector(".btn-save");
  const productId = document.getElementById("productId");

  variantRowsData = [];
  clearProductFormAlert();

  if (productId) productId.value = "";
  if (name) name.value = "";
  if (sku) sku.value = "";
  if (stock) stock.value = "";
  const options = getCategoryOptions();
  if (category) {
    const selectableOptions = getSelectableCategoryOptions(options);
    const hasCurrent = selectableOptions.some((item) => normalizeCategoryKey(item) === normalizeCategoryKey(currentCategory));
    category.value = hasCurrent ? currentCategory : getDefaultCategoryValue(options);
  }
  if (imageUrl) imageUrl.value = "";
  if (modalTitle) modalTitle.textContent = "➕ Thêm sản phẩm";
  if (saveBtn) saveBtn.textContent = "Lưu sản phẩm";
  addVariantRow();
  updateVariantFilesHint();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function getProductBaseOldPriceForDisplay(product) {
  const firstVariantRaw = Array.isArray(product?.variantOldPrices) ? product.variantOldPrices[0] : null;
  const parsedVariantBase = parseVariantPriceInput(firstVariantRaw);
  const variantBase = Number(parsedVariantBase);
  if (Number.isFinite(variantBase) && variantBase > 0) {
    return Math.round(variantBase);
  }

  const fallback = Number(product?.oldPrice);
  if (!Number.isFinite(fallback) || fallback <= 0) return null;
  return Math.round(fallback);
}

function hasVisibleOldPrice(product) {
  const oldPrice = Number(getProductBaseOldPriceForDisplay(product));
  const firstVariantRaw = Array.isArray(product?.variantPrices) ? product.variantPrices[0] : null;
  const parsedVariantBase = parseVariantPriceInput(firstVariantRaw);
  const variantBase = Number(parsedVariantBase);
  const price = Number.isFinite(variantBase) && variantBase >= 0
    ? variantBase
    : Number(product?.price);
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return false;
  if (!Number.isFinite(price) || price <= 0) return true;
  return oldPrice > price;
}

function getProductBasePriceForDisplay(product) {
  const firstVariantRaw = Array.isArray(product?.variantPrices) ? product.variantPrices[0] : null;
  const parsedVariantBase = parseVariantPriceInput(firstVariantRaw);
  const variantBase = Number(parsedVariantBase);
  if (Number.isFinite(variantBase) && variantBase >= 0) {
    return Math.round(variantBase);
  }

  const fallback = Number(product?.price || 0);
  if (!Number.isFinite(fallback) || fallback < 0) return 0;
  return Math.round(fallback);
}

function applyBrandLogo(logoUrl) {
  const logoEl = document.getElementById("adminBrandLogo");
  if (!logoEl) return;
  logoEl.src = String(logoUrl || DEFAULT_SHOP_LOGO);
}

async function loadBrandSettings() {
  try {
    const res = await fetch(API + "/settings");
    const { raw, data, requestId } = await readApiResponseSafely(res);
    if (!res.ok) {
      showToast(getApiErrorMessage(res, raw, data, "Không thể tải cài đặt", requestId));
      return;
    }
    applyBrandLogo(data.shopLogo);
    shopPublicUrl = sanitizeOrigin(data.shopPublicUrl) || DEFAULT_PUBLIC_SHOP_URL;
    syncCategoryUi();
    const serverLimit = Number(data.uploadMaxFileSizeMb);
    uploadMaxFileSizeMb = Number.isFinite(serverLimit) && serverLimit > 0
      ? Math.floor(serverLimit)
      : DEFAULT_UPLOAD_MAX_FILE_SIZE_MB;
  } catch (error) {
    applyBrandLogo(DEFAULT_SHOP_LOGO);
  }
}

function triggerLogoPicker() {
  const input = document.getElementById("adminLogoFile");
  if (input) input.click();
}

async function handleLogoFileChange(input) {
  const file = input?.files?.[0] || null;
  if (!file) return;

  try {
    const uploadedUrl = await uploadImage(file);
    const saveRes = await fetch(API + "/settings/logo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: uploadedUrl })
    });

    const saveData = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) {
      throw new Error(saveData.error || "Không thể cập nhật logo");
    }

    applyBrandLogo(saveData.shopLogo || uploadedUrl);
    showToast("Đã cập nhật logo");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Lỗi khi đổi logo");
  } finally {
    if (input) input.value = "";
  }
}

function exportOrdersExcel() {
  const orders = state.orders || [];
  if (!orders.length) {
    showToast("Không có đơn hàng để xuất");
    return;
  }

  const rows = orders.map((order) => ({
    "Tạm tính": getOrderSubtotal(order).toLocaleString("vi-VN") + "đ",
    "Phí ship": getOrderShippingFee(order).toLocaleString("vi-VN") + "đ",
    "Tổng thanh toán": getOrderGrandTotal(order).toLocaleString("vi-VN") + "đ",
    "Mã đơn": order.id || "",
    "Khách hàng": order.customer || "",
    "Số điện thoại": order.phone || "",
    "Địa chỉ": order.address || "",
    "Thời gian": formatOrderTime(order.createdAt),
    "Trạng thái": {
      pending: "Chờ xử lý",
      confirmed: "Đã xác nhận",
      done: "Hoàn tất"
    }[order.status] || order.status || "",
    "Sản phẩm": (order.items || []).map((item) => {
      const variantPart = item.variantName ? ` (${item.variantName}${item.size ? ` - ${item.size}` : ""})` : (item.size ? ` (${item.size})` : "");
      return `${item.name}${variantPart} x${item.qty}`;
    }).join("; ")
  }));

  const headers = Object.keys(rows[0]);
  const csvContent = [headers.join(",")].concat(rows.map((row) => headers.map((header) => `"${String(row[header]).replace(/"/g, '""')}"`).join(","))).join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orders.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("Đã xuất file Excel");
}

function exportOrdersPDF() {
  const orders = state.orders || [];
  if (!orders.length) {
    showToast("Không có đơn hàng để xuất");
    return;
  }

  const rows = orders.map((order) => [
    order.id || "",
    order.customer || "",
    order.phone || "",
    order.address || "",
    formatOrderTime(order.createdAt),
    getOrderShippingFee(order).toLocaleString("vi-VN") + "đ",
    getOrderGrandTotal(order).toLocaleString("vi-VN") + "đ",
    {
      pending: "Chờ xử lý",
      confirmed: "Đã xác nhận",
      done: "Hoàn tất"
    }[order.status] || order.status || "",
    (order.items || []).map((item) => {
      const variantPart = item.variantName ? ` (${item.variantName}${item.size ? ` - ${item.size}` : ""})` : (item.size ? ` (${item.size})` : "");
      return `${item.name}${variantPart} x${item.qty}`;
    }).join("; ")
  ]);

  const printWindow = window.open("", "", "width=900,height=700");
  if (!printWindow) {
    showToast("Trình duyệt chặn cửa sổ in");
    return;
  }

  const tableRows = rows.map((row) => `
    <tr>
      ${row.map((cell) => `<td>${String(cell).replace(/\n/g, "<br>")}</td>`).join("")}
    </tr>
  `).join("");

  printWindow.document.write(`
    <html>
      <head>
        <title>Danh sách đơn hàng</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { font-size: 22px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>Danh sách đơn hàng</h1>
        <table>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách hàng</th>
              <th>SĐT</th>
              <th>Địa chỉ</th>
              <th>Thời gian</th>
              <th>Phí ship</th>
              <th>Tổng thanh toán</th>
              <th>Trạng thái</th>
              <th>Sản phẩm</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  showToast("Đã mở bản xem trước PDF");
}

function openModal(product = null) {
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modal-title");
  const saveBtn = document.querySelector(".btn-save");
  const productId = document.getElementById("productId");
  const name = document.getElementById("name");
  const sku = document.getElementById("sku");
  const stock = document.getElementById("stock");
  const category = document.getElementById("category");
  const imageUrl = document.getElementById("imageUrl");

  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("show");
  }

  clearProductFormAlert();

  if (product) {
    if (productId) productId.value = product.id;
    if (name) name.value = product.name || "";
    if (sku) sku.value = product.sku || "";
    if (stock) stock.value = product.stock || "";
    if (category) {
      const nextCategory = normalizeCategoryLabel(product.category || "");
      const selectableOptions = getSelectableCategoryOptions();
      const hasCategory = selectableOptions.some((item) => normalizeCategoryKey(item) === normalizeCategoryKey(nextCategory));
      category.value = hasCategory ? nextCategory : getDefaultCategoryValue();
    }
    if (imageUrl) imageUrl.value = product.image || "";
    variantRowsData = [];
    const images = Array.isArray(product.images)
      ? product.images.filter(Boolean)
      : (product.image ? [product.image] : []);
    const names = Array.isArray(product.variantNames)
      ? product.variantNames
      : images.map((_, index) => `Màu ${index + 1}`);
    const rowStocks = Array.isArray(product.variantColorStocks)
      ? product.variantColorStocks
      : (Array.isArray(product.variantStocks)
        ? product.variantStocks
        : []);
    const rowCutLengths = Array.isArray(product.variantCutLengths)
      ? product.variantCutLengths
      : [];
    const rowPrices = Array.isArray(product.variantPrices)
      ? product.variantPrices
      : [];
    const rowOldPrices = Array.isArray(product.variantOldPrices)
      ? product.variantOldPrices
      : [];
    const fallbackStock = Number(product.stock || 0);
    const rowCount = Math.max(images.length, names.length, rowStocks.length, rowCutLengths.length, rowPrices.length, rowOldPrices.length, 1);
    for (let index = 0; index < rowCount; index += 1) {
      const parsedName = splitVariantNameAndLength(names[index]);
      const nameValue = String(parsedName.name || "").trim() || `Màu ${index + 1}`;
      const imageUrlValue = String(images[index] || "").trim();
      const rowStockValue = rowStocks[index];
      const rowCutLengthValue = parseVariantLengthInput(rowCutLengths[index]);
      const fallbackRowPrice = index === 0 ? parseVariantPriceInput(product.price) : null;
      const rowPriceValue = parseVariantPriceInput(rowPrices[index] ?? fallbackRowPrice);
      const fallbackRowOldPrice = index === 0 ? parseVariantPriceInput(product.oldPrice) : null;
      const rowOldPriceValue = parseVariantPriceInput(rowOldPrices[index] ?? fallbackRowOldPrice);
      const stocksValue = Number.isFinite(Number(rowStockValue))
        ? Number(rowStockValue)
        : (rowStockValue && typeof rowStockValue === "object"
            ? Object.values(rowStockValue).reduce((sum, qty) => {
                const n = Number(qty);
                return Number.isFinite(n) ? Math.round((sum + Math.max(0, Math.round(n * 100) / 100)) * 100) / 100 : sum;
              }, 0)
            : fallbackStock);
      variantRowsData.push(createVariantRowData(nameValue, imageUrlValue, stocksValue, Number.isFinite(rowCutLengthValue) ? rowCutLengthValue : parsedName.cutLength, rowPriceValue, rowOldPriceValue));
    }
    renderVariantRows();
    updateVariantFilesHint();
    syncTotalStockInputFromRows();
    if (modalTitle) modalTitle.textContent = "✏️ Sửa sản phẩm";
    if (saveBtn) saveBtn.textContent = "Cập nhật";
  } else {
    resetProductForm();
  }
}

function closeModal() {
  const modal = document.getElementById("modal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("show");
  }
  clearProductFormAlert();
  resetProductForm();
}

function previewImage() {
  const input = document.getElementById("imageFile");
  const preview = document.getElementById("preview");

  if (!input || !preview) return;

  const file = input.files && input.files[0];
  if (!file) {
    preview.src = document.getElementById("imageUrl")?.value || "https://placehold.co/250x250?text=Preview";
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    preview.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function switchTab(tabName) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${tabName}-view`);
  });
}

async function load() {
  const loading = document.getElementById("loading");
  const list = document.getElementById("list");
  const search = (document.getElementById("search")?.value || "").toLowerCase();
  const category = getAdminCategory();

  if (loading) loading.style.display = "block";

  try {
    const productsUrl = category ? `${API}/products/all?category=${encodeURIComponent(category)}` : `${API}/products/all`;
    const res = await fetch(productsUrl);
    const { raw, data, requestId } = await readApiResponseSafely(res);
    if (!res.ok) {
      showToast(getApiErrorMessage(res, raw, data, "Không thể tải danh sách sản phẩm", requestId));
      return;
    }
    const normalizedCurrentCategory = normalizeCategoryKey(category);
    const sourceData = Array.isArray(data) ? data : [];
    syncCategoryUi();
    const categoryScopedData = category
      ? sourceData.filter((p) => normalizeCategoryKey(p.category || "") === normalizedCurrentCategory)
      : sourceData;
    state.products = categoryScopedData;

    const headerTitle = document.querySelector("#products-view .header h1");
    const headerDesc = document.querySelector("#products-view .header p");
    const addBtn = document.querySelector(".header .btn-add");
    const shopLink = document.getElementById("shop-link");
    if (headerTitle) {
      headerTitle.textContent = category ? `📦 Quản lí đơn hàng kho vải quận 4 - ${category}` : "📦 Quản lí đơn hàng kho vải quận 4";
    }
    if (headerDesc) {
      headerDesc.textContent = category ? `Đang quản lý riêng danh mục ${category}` : "Quản lý sản phẩm kho vải quận 4";
    }
    if (addBtn) {
      addBtn.textContent = category ? `+ Thêm sản phẩm vào ${category}` : "+ Thêm sản phẩm";
    }
    if (shopLink) {
      shopLink.href = getShopCategoryUrl(category);
      shopLink.textContent = category ? `🛒 Giỏ hàng ${category}` : "🛒 Xem giỏ hàng";
    }

    const filtered = categoryScopedData.filter((p) => {
      const haystack = `${p.name || ""} ${p.sku || ""}`.toLowerCase();
      return haystack.includes(search);
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PRODUCT_PAGE_SIZE));
    const currentPage = clampPage(paginationState.products, totalPages);
    paginationState.products = currentPage;
    const pageItems = filtered.slice((currentPage - 1) * PRODUCT_PAGE_SIZE, currentPage * PRODUCT_PAGE_SIZE);

    let html = "";
    pageItems.forEach((p) => {
      const basePrice = getProductBasePriceForDisplay(p);
      const status = p.stock <= 0 ? "Hết hàng" : p.stock <= 3 ? "Sắp hết" : "Còn hàng";
      const categoryLabel = p.category || "Khác";
      const isHidden = category ? Boolean(p.hidden) : Boolean(p.hiddenGlobal);
      const visibilityLabel = isHidden ? "Đang ẩn" : "Đang hiện";
      html += `
        <tr class="product-row ${isHidden ? "is-hidden" : ""}" data-product-id="${p.id}">
          <td class="drag-cell">
            <span class="drag-handle" data-product-id="${p.id}" title="Giữ và kéo để đổi thứ tự">☰</span>
          </td>
          <td><img src="${p.image || "https://placehold.co/80x80?text=No+Image"}" width="60" height="60" loading="lazy" decoding="async" style="object-fit:cover"></td>
          <td class="product-name-cell">
            <div class="product-name-wrap">
              <span class="product-title">${p.name}</span>
              <span class="product-sku">${visibilityLabel}</span>
              ${p.sku ? `<span class="product-sku">SKU: ${p.sku}</span>` : ""}
            </div>
          </td>
          <td>${categoryLabel}</td>
          <td>
            <div class="price-cell">
              <span class="price-live">${Number(basePrice || 0).toLocaleString()}đ</span>
              ${hasVisibleOldPrice(p) ? `<span class="price-old">${Number(getProductBaseOldPriceForDisplay(p)).toLocaleString()}đ</span>` : ""}
            </div>
          </td>
          <td>
            <div class="stock-inline">
              <input type="number" min="0" step="0.01" value="${p.stock}" id="stock-${p.id}" />
              <button onclick="updateStock(${p.id})">Cập nhật</button>
            </div>
          </td>
          <td>${status}</td>
          <td>
            <div class="action">
              <a class="product-link-btn" href="${getProductShopUrl(p)}" target="_blank" rel="noopener noreferrer" title="Mở link riêng sản phẩm">🔗</a>
              <button class="toggle-visibility ${isHidden ? "show" : "hide"}" onclick="toggleProductVisibility(${p.id})" title="${isHidden ? "Hiện sản phẩm" : "Ẩn sản phẩm"}">${isHidden ? "👁️" : "🙈"}</button>
              <button class="edit" onclick="editProduct(${p.id})" title="Sửa sản phẩm">✏️</button>
              <button class="delete" onclick="deleteProduct(${p.id})" title="Xóa sản phẩm">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    });

    if (list) list.innerHTML = html || '<tr><td colspan="8">Không có sản phẩm</td></tr>';
    renderPagination("product-pagination", "products", totalItems, PRODUCT_PAGE_SIZE, (page) => {
      setPaginationPage("products", page);
      load();
    });
    setupProductDragAndDrop();

    const totalProduct = document.getElementById("totalProduct");
    const totalStock = document.getElementById("totalStock");
    const lowStock = document.getElementById("lowStock");
    const outStock = document.getElementById("outStock");

    if (totalProduct) totalProduct.textContent = categoryScopedData.length;
    if (totalStock) totalStock.textContent = categoryScopedData.reduce((sum, p) => sum + Number(p.stock || 0), 0);
    if (lowStock) lowStock.textContent = categoryScopedData.filter((p) => p.stock > 0 && p.stock <= 3).length;
    if (outStock) outStock.textContent = categoryScopedData.filter((p) => Number(p.stock || 0) <= 0).length;
  } catch (error) {
    console.error(error);
    showToast("Lỗi khi tải dữ liệu");
  } finally {
    if (loading) loading.style.display = "none";
  }
}

async function refreshDashboard() {
  await Promise.all([load(), loadOrders()]);
}

async function uploadImage(file) {
  if (!file) return "";

  if (!String(file.type || "").toLowerCase().startsWith("image/")) {
    throw new Error("File đã chọn không phải ảnh hợp lệ");
  }

  const maxBytes = Math.max(1, Number(uploadMaxFileSizeMb) || DEFAULT_UPLOAD_MAX_FILE_SIZE_MB) * 1024 * 1024;
  const uploadFile = await compressImageForUpload(file, maxBytes);

  if (Number(uploadFile.size || 0) > maxBytes) {
    const sizeMb = (Number(uploadFile.size || 0) / (1024 * 1024)).toFixed(2);
    throw new Error(`Ảnh \"${file.name || "không rõ tên"}\" nặng ${sizeMb}MB, vượt giới hạn ${uploadMaxFileSizeMb}MB`);
  }

  const formData = new FormData();
  formData.append("image", uploadFile);

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), 45000)
    : null;

  let res;
  try {
    res = await fetch(API + "/upload", {
      method: "POST",
      body: formData,
      signal: controller ? controller.signal : undefined
    });
  } catch (error) {
    if (controller && error?.name === "AbortError") {
      throw new Error("Upload ảnh quá lâu, vui lòng thử ảnh nhẹ hơn hoặc thử lại");
    }

    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (parseError) {
    data = { error: raw || "Phản hồi upload không hợp lệ" };
  }

  if (!res.ok) {
    throw new Error(data.error || "Không thể upload ảnh");
  }

  return data.url || "";
}

async function saveProduct() {
  const name = document.getElementById("name").value.trim();
  const sku = document.getElementById("sku").value.trim();
  const category = document.getElementById("category").value;
  const stock = document.getElementById("stock").value;
  const productId = document.getElementById("productId").value;
  const saveBtn = document.querySelector(".btn-save");

  clearProductFormAlert();

  const missingGeneralFields = [];
  if (!name) missingGeneralFields.push("Tên sản phẩm");
  if (!sku) missingGeneralFields.push("Mã SKU");
  if (!category) missingGeneralFields.push("Danh mục");
  if (showMissingFieldsToast(missingGeneralFields)) {
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.dataset.defaultText = saveBtn.textContent;
    saveBtn.textContent = "Đang lưu...";
  }

  try {
    const isEditing = Boolean(productId);

    const normalizedRows = variantRowsData
      .map((row, index) => ({
        ...row,
        rawName: String(row.name || "").trim(),
        name: String(row.name || "").trim() || `Màu ${index + 1}`,
        cutLength: parseVariantLengthInput(row.cutLength),
        variantPrice: parseVariantPriceInput(row.variantPrice),
        variantOldPrice: parseVariantPriceInput(row.variantOldPrice),
        colorStock: Number.isFinite(Number(row.colorStock))
          ? Math.max(0, Math.round(Number(row.colorStock) * 100) / 100)
          : null,
        hasAnyInput: Boolean(
          row.file ||
          row.existingUrl ||
          String(row.name || "").trim() ||
          String(row.cutLength ?? "").trim() ||
          String(row.variantPrice ?? "").trim() ||
          String(row.variantOldPrice ?? "").trim() ||
          String(row.colorStock ?? "").trim()
        )
      }))
      .filter((row, index) => row.hasAnyInput || index === 0);

    const missingVariantRows = [];
    normalizedRows.forEach((row, index) => {
      const missingFields = [];
      if (!Boolean(row.file || row.existingUrl)) missingFields.push("Ảnh màu");
      if (!row.rawName) missingFields.push("Tên màu");
      if (!Number.isFinite(Number(row.cutLength))) missingFields.push("Chiều dài mỗi khúc (m)");
      if (!Number.isFinite(Number(row.variantPrice))) missingFields.push("Giá khổ này (đ)");
      if (!Number.isFinite(Number(row.colorStock))) missingFields.push("Số mét tồn");
      if (missingFields.length) {
        missingVariantRows.push(`Dòng màu ${index + 1}: ${missingFields.join(", ")}`);
      }
    });

    if (missingVariantRows.length) {
      setProductFormAlert(`Chưa điền đủ: ${missingVariantRows[0]}`);
      return;
    }

    const uploadedVariantImages = await Promise.all(
      normalizedRows.map((row) => (row.file ? uploadImage(row.file) : Promise.resolve("")))
    );

    const existingProduct = isEditing
      ? state.products.find((item) => String(item.id) === String(productId))
      : null;

    const fallbackExistingImages = Array.isArray(existingProduct?.images)
      ? existingProduct.images.filter(Boolean)
      : (existingProduct?.image ? [existingProduct.image] : []);

    const firstUploadedVariantImage = uploadedVariantImages.find((url) => String(url || "").trim()) || "";
    const firstExistingVariantImage = normalizedRows.find((row) => String(row.existingUrl || "").trim())?.existingUrl || "";
    const baseVariantImage = firstUploadedVariantImage || firstExistingVariantImage || fallbackExistingImages[0] || "";

    const finalVariantRows = normalizedRows
      .map((row, index) => ({
        name: composeVariantName(row, index),
        image: uploadedVariantImages[index] || row.existingUrl || fallbackExistingImages[index] || baseVariantImage,
        variantPrice: Number.isFinite(Number(row.variantPrice)) ? Math.max(0, Math.round(Number(row.variantPrice))) : null,
        variantOldPrice: Number.isFinite(Number(row.variantOldPrice)) ? Math.max(0, Math.round(Number(row.variantOldPrice))) : null,
        colorStock: Number.isFinite(Number(row.colorStock)) ? Math.max(0, Math.round(Number(row.colorStock) * 100) / 100) : null
      }));

    const images = finalVariantRows.length
      ? finalVariantRows.map((row) => row.image || baseVariantImage).filter(Boolean)
      : fallbackExistingImages;

    const variantNames = finalVariantRows.length
      ? finalVariantRows.map((row, index) => row.name || `Màu ${index + 1}`)
      : images.map((_, index) => `Màu ${index + 1}`);

    const variantSizes = images.map((_, index) => {
      const existingRow = Array.isArray(existingProduct?.variantSizes) ? existingProduct.variantSizes[index] : [];
      return Array.isArray(existingRow)
        ? existingRow.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    });

    const variantColorStocks = finalVariantRows.length
      ? finalVariantRows.map((row) => (Number.isFinite(Number(row.colorStock)) ? Math.max(0, Math.round(Number(row.colorStock) * 100) / 100) : null))
      : images.map(() => null);

    const variantPrices = finalVariantRows.length
      ? finalVariantRows.map((row) => (Number.isFinite(Number(row.variantPrice)) ? Math.max(0, Math.round(Number(row.variantPrice))) : null))
      : images.map((_, index) => {
          const existingValue = Array.isArray(existingProduct?.variantPrices) ? existingProduct.variantPrices[index] : null;
          const parsed = parseVariantPriceInput(existingValue);
          return Number.isFinite(Number(parsed)) ? parsed : null;
        });

    const variantOldPrices = finalVariantRows.length
      ? finalVariantRows.map((row) => (Number.isFinite(Number(row.variantOldPrice)) ? Math.max(0, Math.round(Number(row.variantOldPrice))) : null))
      : images.map((_, index) => {
          const existingValue = Array.isArray(existingProduct?.variantOldPrices) ? existingProduct.variantOldPrices[index] : null;
          const fallbackValue = index === 0 ? existingProduct?.oldPrice : null;
          const parsed = parseVariantPriceInput(existingValue ?? fallbackValue);
          return Number.isFinite(Number(parsed)) ? parsed : null;
        });

    const basePriceFromFirstVariant = parseVariantPriceInput(variantPrices[0]);
    if (!Number.isFinite(basePriceFromFirstVariant) || basePriceFromFirstVariant < 0) {
      showMissingFieldsToast(["Giá khổ này của dòng màu 1"]);
      return;
    }

    const variantCutLengths = finalVariantRows.length
      ? finalVariantRows.map((row) => {
          const length = parseVariantLengthInput(row.cutLength);
          return Number.isFinite(length) ? length : null;
        })
      : images.map(() => null);

    const normalizedStock = Number(stock);
    const finalStock = Number.isFinite(normalizedStock) ? Math.max(0, Math.round(normalizedStock * 100) / 100) : 0;
    const hasRowStock = variantColorStocks.some((qty) => Number.isFinite(Number(qty)));
    const summedRowStock = hasRowStock
      ? variantColorStocks.reduce((sum, qty) => {
          if (!Number.isFinite(Number(qty))) return sum;
          return Math.round((sum + Math.max(0, Math.round(Number(qty) * 100) / 100)) * 100) / 100;
        }, 0)
      : 0;
    const stockValueForSave = String(stock || "").trim() !== ""
      ? (hasRowStock ? summedRowStock : finalStock)
      : summedRowStock;

    const sizes = Array.isArray(existingProduct?.sizes)
      ? existingProduct.sizes.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const finalImage = images[0] || "";

    const saveController = typeof AbortController !== "undefined" ? new AbortController() : null;
    const saveTimeoutId = saveController
      ? setTimeout(() => saveController.abort(), 30000)
      : null;

    let res;
    try {
      res = await fetch(API + (isEditing ? `/product/${productId}` : "/product/add"), {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sku, category, price: Math.round(basePriceFromFirstVariant), oldPrice: variantOldPrices[0] ?? null, stock: stockValueForSave, image: finalImage, images, variantNames, variantPrices, variantOldPrices, variantCutLengths, sizes, variantSizes, variantColorStocks }),
        signal: saveController ? saveController.signal : undefined
      });
    } catch (error) {
      if (saveController && error?.name === "AbortError") {
        throw new Error("Lưu sản phẩm quá lâu, vui lòng thử lại");
      }
      throw error;
    } finally {
      if (saveTimeoutId) clearTimeout(saveTimeoutId);
    }

    const { raw, data, requestId } = await readApiResponseSafely(res);

    if (!res.ok) {
      setProductFormAlert(getApiErrorMessage(res, raw, data, "Không thể lưu sản phẩm", requestId));
      return;
    }

    showToast(isEditing ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm");
    closeModal();
    await load();
    loadOrders();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Lỗi khi lưu sản phẩm");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = saveBtn.dataset.defaultText || (productId ? "Cập nhật" : "Lưu sản phẩm");
      delete saveBtn.dataset.defaultText;
    }
  }
}

async function loadOrders() {
  try {
    const res = await fetch(API + "/orders");
    const { raw, data: rawData, requestId } = await readApiResponseSafely(res);
    if (!res.ok) {
      showToast(getApiErrorMessage(res, raw, rawData, "Không thể tải danh sách đơn hàng", requestId));
      return;
    }
    const data = Array.isArray(rawData) ? rawData : [];
    state.orders = data;
    populateCustomerDataYearOptions(data);
    populateProductInsightsDateOptions(data);
    renderCustomerDataView();
    renderProductInsightsView();

    const list = document.getElementById("order-list");
    const search = (document.getElementById("order-search")?.value || "").toLowerCase();
    const totalOrders = document.getElementById("totalOrders");
    const pendingOrders = document.getElementById("pendingOrders");
    const confirmedOrders = document.getElementById("confirmedOrders");
    const doneOrders = document.getElementById("doneOrders");

    const filteredOrders = data.filter((order) => {
      const haystack = `${order.customer || ""} ${order.phone || ""} ${order.address || ""} ${order.id || ""}`.toLowerCase();
      return haystack.includes(search);
    });

    const totalItems = filteredOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / ORDER_PAGE_SIZE));
    const currentPage = clampPage(paginationState.orders, totalPages);
    paginationState.orders = currentPage;
    const pageOrders = filteredOrders.slice((currentPage - 1) * ORDER_PAGE_SIZE, currentPage * ORDER_PAGE_SIZE);

    if (list) {
      list.innerHTML = pageOrders.map((order) => {
        const statusText = {
          pending: "Chờ xử lý",
          confirmed: "Đã xác nhận",
          done: "Hoàn tất"
        }[order.status] || order.status;
        const subtotal = getOrderSubtotal(order);
        const shippingFee = getOrderShippingFee(order);
        const grandTotal = getOrderGrandTotal(order);
        const totalMeters = getOrderTotalMeters(order);

        const items = Array.isArray(order.items) ? order.items : [];
        const itemSummary = items.map((item) => {
          const variantPart = item.variantName ? ` (${item.variantName}${item.size ? ` - ${item.size}` : ""})` : (item.size ? ` (${item.size})` : "");
          return `<span class="order-item-pill">${item.name}${variantPart} x${item.qty}</span>`;
        }).join("");

        const skuSummary = [...new Set(items
          .map((item) => String(item.sku || "").trim())
          .filter(Boolean))].join(" • ") || "Chưa có SKU";

        return `
          <tr>
            <td class="order-customer-cell">
              <div class="order-customer-top">
                <span class="order-customer-name">${order.customer || "Khách lẻ"}</span>
                <span class="order-sku-chip">SKU: ${skuSummary}</span>
              </div>
              <div class="order-items-wrap">${itemSummary || '<span class="order-item-pill">Không có sản phẩm</span>'}</div>
            </td>
            <td class="order-meters-cell">${totalMeters ? `${formatMeterValue(totalMeters)}m` : "—"}</td>
            <td class="order-phone-cell">${order.phone || "—"}</td>
            <td class="order-address-cell">${order.address || "—"}</td>
            <td class="order-time-cell">${formatOrderTime(order.createdAt)}</td>
            <td class="order-total-cell">
              <div class="order-money-row"><span>Tạm tính</span><strong>${subtotal.toLocaleString()}đ</strong></div>
              <div class="order-money-row"><span>Phí ship</span><strong>${shippingFee.toLocaleString()}đ</strong></div>
              <div class="order-money-row grand"><span>Tổng thanh toán</span><strong>${grandTotal.toLocaleString()}đ</strong></div>
            </td>
            <td><span class="order-badge ${order.status}">${statusText}</span></td>
            <td>
              <div class="order-actions">
                <select class="order-status-select ${order.status}" data-current-status="${order.status}" onchange="handleOrderAction(${order.id}, this)">
                  <option value="pending" ${order.status === "pending" ? "selected" : ""}>⏳ Chờ xử lý</option>
                  <option value="confirmed" ${order.status === "confirmed" ? "selected" : ""}>✓ Đã xác nhận</option>
                  <option value="done" ${order.status === "done" ? "selected" : ""}>✅ Hoàn tất</option>
                  <option value="delete">🗑️ Xóa đơn</option>
                </select>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }

    renderPagination("order-pagination", "orders", totalItems, ORDER_PAGE_SIZE, (page) => {
      setPaginationPage("orders", page);
      loadOrders();
    });

    if (totalOrders) totalOrders.textContent = data.length;
    if (pendingOrders) pendingOrders.textContent = data.filter((order) => order.status === "pending").length;
    if (confirmedOrders) confirmedOrders.textContent = data.filter((order) => order.status === "confirmed").length;
    if (doneOrders) doneOrders.textContent = data.filter((order) => order.status === "done").length;
  } catch (error) {
    console.error(error);
    showToast("Lỗi khi tải đơn hàng");
  }
}

async function handleOrderAction(id, selectEl) {
  const nextAction = selectEl?.value;
  const currentStatus = selectEl?.dataset?.currentStatus || "pending";

  if (!nextAction) return;

  if (nextAction === "delete") {
    const deleted = await deleteOrder(id);
    if (!deleted && selectEl) {
      selectEl.value = currentStatus;
    }
    return;
  }

  const updated = await updateOrderStatus(id, nextAction);
  if (updated && selectEl) {
    selectEl.dataset.currentStatus = nextAction;
  } else if (selectEl) {
    selectEl.value = currentStatus;
  }
}

async function updateOrderStatus(id, status) {
  try {
    const res = await fetch(API + `/order/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      throw new Error("Không thể cập nhật trạng thái");
    }

    showToast("Đã cập nhật trạng thái đơn hàng");
    await refreshDashboard();
    return true;
  } catch (error) {
    console.error(error);
    showToast("Lỗi cập nhật đơn hàng");
    return false;
  }
}

async function deleteOrder(id) {
  if (!confirm("Bạn có chắc muốn xóa đơn hàng này?")) return false;

  try {
    const res = await fetch(API + `/order/${id}`, {
      method: "DELETE"
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok && data.error) {
      showToast(data.error);
      return false;
    }

    showToast("Đã xóa đơn hàng");
    await refreshDashboard();
    return true;
  } catch (error) {
    console.error(error);
    showToast("Lỗi khi xóa đơn hàng");
    return false;
  }
}

async function updateStock(id) {
  const input = document.getElementById(`stock-${id}`);
  const stock = Number(input?.value || 0);

  try {
    const res = await fetch(API + "/product/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stock })
    });

    if (!res.ok) {
      throw new Error("Không thể cập nhật tồn kho");
    }

    showToast("Đã cập nhật tồn kho");
    await refreshDashboard();
  } catch (error) {
    console.error(error);
    showToast("Lỗi cập nhật tồn kho");
  }
}

function editProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (product) {
    openModal(product);
  }
}

async function deleteProduct(id) {
  if (!confirm("Bạn có chắc muốn xóa sản phẩm này?")) return;

  try {
    const res = await fetch(API + `/product/${id}`, {
      method: "DELETE"
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok && data.error) {
      showToast(data.error);
      return;
    }

    showToast("Đã xóa sản phẩm");
    await refreshDashboard();
  } catch (error) {
    console.error(error);
    showToast("Lỗi khi xóa sản phẩm");
  }
}

async function toggleProductVisibility(id) {
  const category = getAdminCategory();

  try {
    const res = await fetch(API + "/product/toggle-hidden", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(data.error || "Không thể đổi trạng thái hiển thị");
      return;
    }

    showToast(data.hiddenState ? "Đã ẩn sản phẩm" : "Đã hiện sản phẩm");
    await refreshDashboard();
  } catch (error) {
    console.error(error);
    showToast("Lỗi đổi trạng thái hiển thị");
  }
}

function setupProductDragAndDrop() {
  const list = document.getElementById("list");
  if (!list || typeof Sortable === "undefined") return;

  if (productSortable) {
    productSortable.destroy();
  }

  productSortable = new Sortable(list, {
    animation: 160,
    handle: ".drag-handle",
    draggable: ".product-row",
    ghostClass: "drag-ghost",
    chosenClass: "drag-chosen",
    dragClass: "drag-dragging",
    onEnd: async () => {
      const searchValue = (document.getElementById("search")?.value || "").trim();
      if (searchValue) {
        showToast("Hãy xóa từ khóa tìm kiếm trước khi sắp xếp");
        await refreshDashboard();
        return;
      }

      const orderedIds = Array.from(list.querySelectorAll(".product-row"))
        .map((row) => Number(row.dataset.productId))
        .filter(Number.isFinite);

      if (orderedIds.length) {
        await reorderProducts(orderedIds);
      }
    }
  });
}

async function reorderProducts(orderedIds) {
  const category = getAdminCategory();

  try {
    const res = await fetch(API + "/product/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds, category })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(data.error || "Không thể đổi thứ tự sản phẩm");
      return;
    }

    showToast("Đã cập nhật thứ tự sản phẩm");
    await refreshDashboard();
  } catch (error) {
    console.error(error);
    showToast("Lỗi đổi thứ tự sản phẩm");
  }
}

window.openModal = openModal;
window.closeModal = closeModal;
window.previewImage = previewImage;
window.addVariantRow = addVariantRow;
window.removeVariantRow = removeVariantRow;
window.onVariantFileChange = onVariantFileChange;
window.onVariantNameInput = onVariantNameInput;
window.onVariantLengthInput = onVariantLengthInput;
window.onVariantPriceInput = onVariantPriceInput;
window.onVariantOldPriceInput = onVariantOldPriceInput;
window.onVariantStocksInput = onVariantStocksInput;
window.saveProduct = saveProduct;
window.load = load;
window.switchTab = switchTab;
window.updateOrderStatus = updateOrderStatus;
window.deleteOrder = deleteOrder;
window.updateStock = updateStock;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.toggleProductVisibility = toggleProductVisibility;
window.exportOrdersPDF = exportOrdersPDF;
window.exportOrdersExcel = exportOrdersExcel;
window.triggerLogoPicker = triggerLogoPicker;
window.handleLogoFileChange = handleLogoFileChange;
window.renderCustomerDataView = renderCustomerDataView;
window.renderProductInsightsView = renderProductInsightsView;
window.setProductInsightsMode = setProductInsightsMode;

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

syncCategoryUi();

loadBrandSettings();
refreshDashboard();
setInterval(() => {
  loadOrders();
}, 5000);
