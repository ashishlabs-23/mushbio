/**
 * MushBio — Cinematic Photorealistic Hybrid 3D Engine & Experience
 * Integrates High-Resolution Photorealistic Mushroom Ecosystem Artwork across Multi-Plane 3D Depth,
 * Atmospheric Organic Spore Field, GSAP ScrollTrigger Emergence, Lenis Smooth Scrolling,
 * Persistent Cart State, HTML-Sanitized Live Search, and Shop Filtering.
 */

// ==========================================
// 1. PRODUCT DATABASE
// ==========================================
const PRODUCTS = [
  { id: 1, name: "Oyster Mushroom", category: "oyster", price: 280, weight: "1kg", image: "assets/oyster.jpg", rating: 4.9, reviews: 128, inStock: true, desc: "Delicate, velvety texture with a subtle woody taste." },
  { id: 2, name: "Button Mushroom", category: "button", price: 120, weight: "500g", image: "assets/button.jpg", rating: 4.8, reviews: 94, inStock: true, desc: "Classic mild flavor, firm and versatile for every culinary dish." },
  { id: 3, name: "Shiitake Mushroom", category: "shiitake", price: 180, weight: "250g", image: "assets/shiitake.jpg", rating: 5.0, reviews: 210, inStock: true, desc: "Rich savory umami profile, ideal for broths and stir-fries." },
  { id: 4, name: "Milky Mushroom", category: "milky", price: 150, weight: "250g", image: "assets/milky.jpg", rating: 4.7, reviews: 62, inStock: true, desc: "Thick, tender stems with an appetizing firm bite." },
  { id: 5, name: "Portobello Mushroom", category: "portobello", price: 200, weight: "250g", image: "assets/portobello.jpg", rating: 4.9, reviews: 115, inStock: true, desc: "Hearty, robust and meaty caps perfect for grilling." },
  { id: 6, name: "Oyster Mushroom (Small)", category: "oyster", price: 160, weight: "500g", image: "assets/oyster.jpg", rating: 4.8, reviews: 88, inStock: true, desc: "Fresh tender cluster harvested daily from our organic beds." },
  { id: 7, name: "Shiitake Mushroom (Family)", category: "shiitake", price: 340, weight: "500g", image: "assets/shiitake.jpg", rating: 5.0, reviews: 142, inStock: true, desc: "Handpicked premium grade shiitake caps." },
  { id: 8, name: "Button Mushroom (Bulk)", category: "button", price: 220, weight: "1kg", image: "assets/button.jpg", rating: 4.9, reviews: 78, inStock: true, desc: "Crisp white buttons in a fresh farm-pack box." },
  { id: 9, name: "Milky Mushroom (Large)", category: "milky", price: 380, weight: "1kg", image: "assets/milky.jpg", rating: 4.8, reviews: 51, inStock: true, desc: "Generous organic milky mushrooms." },
  { id: 10, name: "Golden Oyster Clusters", category: "oyster", price: 310, weight: "500g", image: "assets/oyster.jpg", rating: 4.9, reviews: 76, inStock: true, desc: "Vibrant golden caps rich in aroma and delicate texture." },
  { id: 11, name: "Cremini Brown Mushrooms", category: "button", price: 170, weight: "400g", image: "assets/button.jpg", rating: 4.8, reviews: 89, inStock: true, desc: "Earthy baby bellas with rich flavor and firm caps." },
  { id: 12, name: "Portobello Jumbo Grilling", category: "portobello", price: 350, weight: "500g", image: "assets/portobello.jpg", rating: 5.0, reviews: 98, inStock: true, desc: "Jumbo selected organic caps, ideal for roasting and burgers." }
];

// ==========================================
// 2. STATE MANAGEMENT (CART & STORAGE)
// ==========================================
let cart = JSON.parse(localStorage.getItem("mushbio_cart") || "[]");
let appliedPromo = localStorage.getItem("mushbio_promo") || null;

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function saveCart() {
  localStorage.setItem("mushbio_cart", JSON.stringify(cart));
  updateCartCounters();
  renderDrawerCart();
  if (typeof renderFullCart === "function") renderFullCart();
}

function updateCartCounters() {
  const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
  $$(".cart-count").forEach(el => {
    el.textContent = totalItems;
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 250);
  });
}

function addToCart(productId, weightVariant = null, quantity = 1) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  const targetWeight = weightVariant || product.weight;
  const existing = cart.find(item => item.id === product.id && item.weight === targetWeight);

  if (existing) {
    existing.qty += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      weight: targetWeight,
      image: product.image,
      qty: quantity
    });
  }

  saveCart();
  showToast(`Added ${escapeHTML(product.name)} (${escapeHTML(targetWeight)}) to cart`);
  openCartDrawer();
}

function updateItemQty(index, delta) {
  if (!cart[index]) return;
  cart[index].qty += delta;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  saveCart();
}

function removeCartItem(index) {
  if (!cart[index]) return;
  const removedName = cart[index].name;
  cart.splice(index, 1);
  saveCart();
  showToast(`Removed ${escapeHTML(removedName)} from cart`);
}

function showToast(msg) {
  let toastEl = $(".toast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `<span>✓</span> ${msg}`;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2400);
}

// ==========================================
// 3. SLIDE-OUT CART DRAWER
// ==========================================
function openCartDrawer() {
  const overlay = $(".cart-drawer-overlay");
  if (overlay) {
    overlay.classList.add("open");
    document.body.classList.add("no-scroll");
  }
}

function closeCartDrawer() {
  const overlay = $(".cart-drawer-overlay");
  if (overlay) {
    overlay.classList.remove("open");
    document.body.classList.remove("no-scroll");
  }
}

function renderDrawerCart() {
  const list = $(".drawer-items");
  const subtotalEl = $("#drawerSubtotal");
  const freeShipBar = $("#freeShipFill");
  const freeShipText = $("#freeShipText");

  if (!list) return;

  if (cart.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--muted)">
      <p style="font-size:16px;font-weight:600;margin-bottom:8px">Your cart is empty</p>
      <small>Discover fresh, organic mushrooms from our farm.</small>
      <div style="margin-top:20px"><a href="shop.html" class="btn btn-secondary btn-pill-sm">Explore Shop</a></div>
    </div>`;
    if (subtotalEl) subtotalEl.textContent = "₹0";
    if (freeShipBar) freeShipBar.style.width = "0%";
    if (freeShipText) freeShipText.textContent = "Add ₹500 more for Free Delivery!";
    return;
  }

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);

  list.innerHTML = cart.map((item, idx) => `
    <div class="drawer-item-card">
      <div class="drawer-item-thumb">
        <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">
      </div>
      <div class="drawer-item-details">
        <div class="drawer-item-top">
          <h4 class="drawer-item-title">${escapeHTML(item.name)}</h4>
          <span class="drawer-item-price">₹${item.price * item.qty}</span>
        </div>
        <span class="drawer-item-weight">${escapeHTML(item.weight)} · ₹${item.price}/pack</span>
        <div class="drawer-item-actions">
          <div class="item-stepper">
            <button class="stepper-action" aria-label="Decrease quantity" onclick="updateItemQty(${idx}, -1)">−</button>
            <span class="stepper-count">${item.qty}</span>
            <button class="stepper-action" aria-label="Increase quantity" onclick="updateItemQty(${idx}, 1)">+</button>
          </div>
          <button class="remove-btn" aria-label="Remove item" onclick="removeCartItem(${idx})">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Remove
          </button>
        </div>
      </div>
    </div>
  `).join("");

  if (subtotalEl) subtotalEl.textContent = `₹${subtotal}`;

  const freeThreshold = 500;
  if (freeShipBar && freeShipText) {
    const pct = Math.min((subtotal / freeThreshold) * 100, 100);
    freeShipBar.style.width = `${pct}%`;
    if (subtotal >= freeThreshold) {
      freeShipText.innerHTML = `<span>🎉</span> <b>Free Express Delivery unlocked!</b>`;
    } else {
      freeShipText.innerHTML = `<span>🚚</span> Add <b>₹${freeThreshold - subtotal}</b> more for <b>Free Delivery</b>!`;
    }
  }
}

// ==========================================
// 4. FULL CART PAGE RENDERER
// ==========================================
function renderFullCart() {
  const container = $("#fullCartList");
  const subtotalEl = $("#cartSubtotal");
  const shippingEl = $("#cartShipping");
  const discountEl = $("#cartDiscount");
  const totalEl = $("#cartFinalTotal");

  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--muted)">
        <h3 style="font-family:'Playfair Display',serif;font-size:24px;margin-bottom:10px">Your cart is empty</h3>
        <p style="font-size:14px;margin-bottom:24px">Explore our organically grown mushrooms and fill your basket.</p>
        <a href="shop.html" class="btn btn-primary">Go to Shop</a>
      </div>
    `;
    if (subtotalEl) subtotalEl.textContent = "₹0";
    if (shippingEl) shippingEl.textContent = "₹0";
    if (totalEl) totalEl.textContent = "₹0";
    return;
  }

  const subtotal = cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  const shipping = subtotal >= 500 || subtotal === 0 ? 0 : 40;
  const discount = appliedPromo === "MUSH10" ? Math.round(subtotal * 0.1) : 0;
  const finalTotal = subtotal + shipping - discount;

  container.innerHTML = cart.map((item, idx) => `
    <div class="cart-item-row">
      <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">
      <div class="cart-item-info">
        <strong>${escapeHTML(item.name)}</strong>
        <small>Size / Weight: ${escapeHTML(item.weight)}</small>
        <div class="item-stepper">
          <button class="stepper-action" onclick="updateItemQty(${idx}, -1)">−</button>
          <span class="stepper-count">${item.qty}</span>
          <button class="stepper-action" onclick="updateItemQty(${idx}, 1)">+</button>
        </div>
      </div>
      <div class="cart-item-total">
        <b>₹${item.price * item.qty}</b>
        <button class="remove-btn" onclick="removeCartItem(${idx})">Remove</button>
      </div>
    </div>
  `).join("");

  if (subtotalEl) subtotalEl.textContent = `₹${subtotal}`;
  if (shippingEl) shippingEl.textContent = shipping === 0 ? "FREE" : `₹${shipping}`;
  if (discountEl) discountEl.textContent = discount > 0 ? `-₹${discount}` : "₹0";
  if (totalEl) totalEl.textContent = `₹${finalTotal}`;
}

// ==========================================
// 5. LIVE SEARCH COMMAND PALETTE
// ==========================================
function openSearchModal() {
  const modal = $("#searchModal");
  if (modal) {
    modal.classList.add("open");
    const input = $("#searchLiveInput");
    if (input) {
      input.value = "";
      input.focus();
      renderSearchResults("");
    }
  }
}

function closeSearchModal() {
  const modal = $("#searchModal");
  if (modal) modal.classList.remove("open");
}

function renderSearchResults(query) {
  const list = $("#searchResults");
  if (!list) return;

  const q = (query || "").trim().toLowerCase();
  const matches = q === "" 
    ? PRODUCTS.slice(0, 4)
    : PRODUCTS.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q));

  if (matches.length === 0) {
    list.innerHTML = `<p style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No mushrooms found matching "${escapeHTML(query)}".</p>`;
    return;
  }

  list.innerHTML = matches.map(p => `
    <div class="search-match-item" onclick="location.href='shop.html?search=${encodeURIComponent(p.name)}'">
      <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}">
      <div class="search-result-info">
        <strong>${escapeHTML(p.name)}</strong>
        <small>${escapeHTML(p.weight)} · ₹${p.price} — ${escapeHTML(p.desc)}</small>
      </div>
    </div>
  `).join("");
}

// ==========================================
// 6. SHOP CATALOG FILTER, PAGINATION & SORT
// ==========================================
let activeCategory = "all";
let maxPrice = 500;
let activeWeights = [];
let sortOrder = "popular";
let currentPage = 1;
const ITEMS_PER_PAGE = 6;

function filterProducts(resetPage = false) {
  const grid = $("#shopProductGrid");
  const countEl = $("#resultsCount");
  const paginationWrap = $("#shopPagination");
  if (!grid) return;

  if (resetPage) {
    currentPage = 1;
  }

  let filtered = PRODUCTS.filter(p => {
    const matchesCat = activeCategory === "all" || p.category === activeCategory;
    const matchesPrice = p.price <= maxPrice;
    const matchesWeight = activeWeights.length === 0 || activeWeights.includes(p.weight);
    return matchesCat && matchesPrice && matchesWeight;
  });

  if (sortOrder === "low") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sortOrder === "high") {
    filtered.sort((a, b) => b.price - a.price);
  } else if (sortOrder === "rating") {
    filtered.sort((a, b) => b.rating - a.rating);
  }

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  if (currentPage > totalPages) {
    currentPage = Math.max(1, totalPages);
  }

  if (totalItems === 0) {
    if (countEl) countEl.textContent = `Showing 0 products`;
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--muted)">No mushrooms match your current filter selection.</div>`;
    if (paginationWrap) {
      paginationWrap.style.display = "none";
      paginationWrap.innerHTML = "";
    }
    return;
  }

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (countEl) {
    countEl.textContent = `Showing ${startIndex + 1}–${Math.min(startIndex + ITEMS_PER_PAGE, totalItems)} of ${totalItems} products`;
  }

  grid.innerHTML = pageItems.map(p => `
    <article class="product-card">
      <div class="product-img-wrap">
        <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}">
      </div>
      <div class="product-body">
        <h3 class="product-title">${escapeHTML(p.name)}</h3>
        <p class="product-meta">${escapeHTML(p.weight)} · Fresh & Organic</p>
        <div class="product-footer">
          <span class="product-price">₹${p.price}</span>
          <button class="btn-card-add" onclick="addToCart(${p.id})">+</button>
        </div>
      </div>
    </article>
  `).join("");

  // Dynamic Pagination Render
  if (paginationWrap) {
    if (totalPages > 1) {
      paginationWrap.style.display = "flex";
      let pagerHTML = "";

      for (let p = 1; p <= totalPages; p++) {
        pagerHTML += `<button class="pager-btn ${p === currentPage ? 'active' : ''}" onclick="goToShopPage(${p})">${p}</button>`;
      }

      if (currentPage < totalPages) {
        pagerHTML += `<button class="pager-btn" onclick="goToShopPage(${currentPage + 1})" aria-label="Next Page">→</button>`;
      }

      paginationWrap.innerHTML = pagerHTML;
    } else {
      paginationWrap.style.display = "none";
      paginationWrap.innerHTML = "";
    }
  }

  if (typeof bindCardTiltElements === "function") {
    bindCardTiltElements();
  }
}

function goToShopPage(pageNum) {
  currentPage = pageNum;
  filterProducts(false);
  const shopHead = $(".shop-heading-strip") || $("#shopProductGrid");
  if (shopHead) {
    const yOffset = shopHead.getBoundingClientRect().top + window.pageYOffset - 85;
    window.scrollTo({ top: yOffset, behavior: "smooth" });
  }
}

function initShopFilters() {
  $$(".cat-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".cat-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.cat || "all";
      filterProducts(true);
    });
  });

  const priceSlider = $("#priceSlider");
  const priceDisplay = $("#maxPriceDisplay");
  if (priceSlider) {
    priceSlider.addEventListener("input", e => {
      maxPrice = +e.target.value;
      if (priceDisplay) priceDisplay.textContent = `₹${maxPrice}`;
      filterProducts(true);
    });
  }

  $$(".weight-chk").forEach(chk => {
    chk.addEventListener("change", () => {
      activeWeights = $$(".weight-chk:checked").map(c => c.value);
      filterProducts(true);
    });
  });

  const sortSelect = $("#sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", e => {
      sortOrder = e.target.value;
      filterProducts(true);
    });
  }

  // URL Query Param Handler (e.g., ?cat=oyster)
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get("cat");
  if (catParam) {
    const targetBtn = $(`[data-cat="${catParam}"]`);
    if (targetBtn) {
      $$(".cat-filter-btn").forEach(b => b.classList.remove("active"));
      targetBtn.classList.add("active");
      activeCategory = catParam;
    }
  }

  filterProducts(true);
}

// ==========================================
// 7. PHOTOREALISTIC HYBRID 3D DEPTH ENGINE
// ==========================================
function initCinematic3DHero() {
  const canvas = document.getElementById("webglHeroCanvas");
  const heroSection = document.getElementById("home");
  if (!canvas || typeof THREE === "undefined" || !heroSection) return;

  // Scene & Camera Setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 5.2);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);

  const textureLoader = new THREE.TextureLoader();

  // Root Scene Group for Parallax & Motion
  const mainStageGroup = new THREE.Group();
  scene.add(mainStageGroup);

  // ----------------------------------------------------
  // LAYER 1: High-Resolution Photorealistic Mushroom Ecosystem Island
  // Seamless edge-feathered alpha shader — blends 100% into #FAF7EE with zero rectangular frame
  // ----------------------------------------------------
  const islandGroup = new THREE.Group();
  islandGroup.position.set(0.1, 0, 0);
  mainStageGroup.add(islandGroup);

  const islandGeo = new THREE.PlaneGeometry(5.2, 5.2, 32, 32);
  
  const islandUniforms = {
    map: { value: null },
    opacity: { value: 1.0 }
  };

  const islandMat = new THREE.ShaderMaterial({
    uniforms: islandUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;

      void main() {
        vec4 tex = texture2D(map, vUv);
        
        // Circular soft radial falloff
        float dist = length(vUv - vec2(0.5)) * 2.0;
        float alpha = (1.0 - smoothstep(0.55, 0.90, dist)) * opacity;
        
        // Blend outer texture colors seamlessly into #FAF7EE cream target
        vec3 cream = vec3(250.0 / 255.0, 247.0 / 255.0, 238.0 / 255.0);
        float colorBlend = smoothstep(0.48, 0.82, dist);
        vec3 finalColor = mix(tex.rgb, cream, colorBlend);
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false
  });

  const islandMesh = new THREE.Mesh(islandGeo, islandMat);
  islandGroup.add(islandMesh);

  textureLoader.load("assets/floating-island.jpg", (tex) => {
    tex.generateMipmaps = true;
    islandUniforms.map.value = tex;
  });

  // ----------------------------------------------------
  // LAYER 2: Atmospheric Bioluminescent Micro-Spore Dust Field
  // Multi-chromatic organic forest spores with interactive drift
  // ----------------------------------------------------
  const sporeCount = 85;
  const sporeGeo = new THREE.BufferGeometry();
  const sporePositions = new Float32Array(sporeCount * 3);
  const sporeColors = new Float32Array(sporeCount * 3);
  const sporeVelocities = [];

  for (let i = 0; i < sporeCount; i++) {
    sporePositions[i * 3] = (Math.random() - 0.5) * 8.5;
    sporePositions[i * 3 + 1] = (Math.random() - 0.5) * 5.8;
    sporePositions[i * 3 + 2] = (Math.random() - 0.5) * 4.0;
    
    // Warm gold, soft emerald, and champagne tones
    const colorType = Math.random();
    if (colorType < 0.4) {
      sporeColors[i * 3] = 0.92;     // R (Gold)
      sporeColors[i * 3 + 1] = 0.85; // G
      sporeColors[i * 3 + 2] = 0.62; // B
    } else if (colorType < 0.75) {
      sporeColors[i * 3] = 0.55;     // R (Emerald)
      sporeColors[i * 3 + 1] = 0.78; // G
      sporeColors[i * 3 + 2] = 0.32; // B
    } else {
      sporeColors[i * 3] = 0.98;     // R (Champagne)
      sporeColors[i * 3 + 1] = 0.95; // G
      sporeColors[i * 3 + 2] = 0.88; // B
    }

    sporeVelocities.push({
      speedY: 0.0016 + Math.random() * 0.0028,
      swaySpeed: 0.007 + Math.random() * 0.014,
      phase: Math.random() * Math.PI * 2,
      origX: sporePositions[i * 3]
    });
  }

  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePositions, 3));
  sporeGeo.setAttribute('color', new THREE.BufferAttribute(sporeColors, 3));
  
  const sporeMat = new THREE.PointsMaterial({
    size: 0.065,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending
  });
  const sporePoints = new THREE.Points(sporeGeo, sporeMat);
  mainStageGroup.add(sporePoints);

  // ----------------------------------------------------
  // LIGHTING (Warm Forest Sunlight & Natural Earth Shadows)
  // ----------------------------------------------------
  const sunLight = new THREE.DirectionalLight(0xFFF9EE, 1.8);
  sunLight.position.set(4, 6, 5);
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0xFFFAF2, 0x222C18, 0.85);
  scene.add(hemiLight);

  // ----------------------------------------------------
  // NATURAL MOUSE PARALLAX (NO DRAGGING)
  // ----------------------------------------------------
  let mouseX = 0, mouseY = 0;
  let curMouseX = 0, curMouseY = 0;

  window.addEventListener("pointermove", e => {
    if (window.innerWidth < 768) return;
    mouseX = (e.clientX / window.innerWidth - 0.5) * 0.45;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 0.3;
  }, { passive: true });

  function onResize() {
    if (!canvas || !canvas.parentElement) return;
    const width = canvas.parentElement.clientWidth || window.innerWidth;
    const height = canvas.parentElement.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  window.addEventListener("resize", onResize);
  onResize();

  // ----------------------------------------------------
  // RENDER LOOP & LIFECYCLE (INTERSECTION OBSERVER)
  // ----------------------------------------------------
  let clock = 0;
  let isHeroVisible = true;
  let animationFrameId = null;

  function animate() {
    if (!isHeroVisible) {
      animationFrameId = null;
      return; // Sleep GPU when off-screen
    }

    animationFrameId = requestAnimationFrame(animate);

    clock += 0.018;

    // Smooth Mouse Parallax Damping
    curMouseX += (mouseX - curMouseX) * 0.05;
    curMouseY += (mouseY - curMouseY) * 0.05;

    // Organic Island Levitation & Breathing
    const breatheY = Math.sin(clock * 1.3) * 0.05;
    islandGroup.position.y = breatheY;

    // True 3D Differential Depth Parallax
    islandGroup.rotation.y = curMouseX * 0.2;
    islandGroup.rotation.x = -curMouseY * 0.15;

    // Animate subtle organic bioluminescent spores with mouse repulsion
    const positions = sporeGeo.attributes.position.array;
    for (let i = 0; i < sporeCount; i++) {
      const idx = i * 3;
      const vel = sporeVelocities[i];
      positions[idx + 1] += vel.speedY;
      positions[idx] += Math.sin(clock + vel.phase) * 0.002 + curMouseX * 0.003;
      if (positions[idx + 1] > 3.2) {
        positions[idx + 1] = -3.2;
        positions[idx] = vel.origX + (Math.random() - 0.5) * 1.5;
      }
    }
    sporeGeo.attributes.position.needsUpdate = true;

    // Gentle camera parallax
    camera.position.x = curMouseX * 0.25;
    camera.position.y = -curMouseY * 0.18;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  // IntersectionObserver: 0% GPU draw calls off-screen
  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      isHeroVisible = entry.isIntersecting;
      if (isHeroVisible && !animationFrameId) {
        animate();
      }
    });
  }, { threshold: 0.05 });

  heroObserver.observe(heroSection);
  animate();
}

// ==========================================
// 8. MAGNETIC CURSOR MICRO-INTERACTIONS
// ==========================================
function initMagneticElements() {
  if (window.innerWidth < 768) return;

  const magneticTargets = $$(
    ".btn-primary, .chip-add-btn, .tool-btn, .cat-circle-item, .modal-close-btn"
  );

  magneticTargets.forEach(el => {
    if (el.dataset.magneticBound) return;
    el.dataset.magneticBound = "true";
    el.classList.add("magnetic-item");

    let rect = null;

    el.addEventListener("mouseenter", () => {
      rect = el.getBoundingClientRect();
    }, { passive: true });

    el.addEventListener("mousemove", e => {
      if (!rect) rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * 0.28;
      const y = (e.clientY - rect.top - rect.height / 2) * 0.28;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }, { passive: true });

    el.addEventListener("mouseleave", () => {
      el.style.transform = "translate3d(0, 0, 0)";
      rect = null;
    });
  });
}

// ==========================================
// 9. SECTION-SPECIFIC CHOREOGRAPHY & GSAP
// ==========================================
function initSectionChoreography() {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  // 0. HERO 3D MULTI-PLANE DEPTH SCROLL PARALLAX
  const heroSection = $(".home-hero");
  if (heroSection && window.innerWidth >= 768) {
    const heroCopy = $(".hero-copy");
    if (heroCopy) {
      gsap.to(heroCopy, {
        y: -90,
        opacity: 0.85,
        ease: "none",
        scrollTrigger: {
          trigger: heroSection,
          start: "top top",
          end: "bottom top",
          scrub: 1.2
        }
      });
    }

    const heroCanvas = $("#webglHeroCanvas");
    if (heroCanvas) {
      gsap.to(heroCanvas, {
        y: 60,
        scale: 0.96,
        ease: "none",
        scrollTrigger: {
          trigger: heroSection,
          start: "top top",
          end: "bottom top",
          scrub: 1
        }
      });
    }

    const chip1 = $(".floating-chip.chip-pos-1");
    const chip2 = $(".floating-chip.chip-pos-2");
    const chip3 = $(".floating-chip.chip-pos-3");
    const woodPlaque = $(".wood-sign-plaque");

    if (chip1) {
      gsap.to(chip1, {
        y: -140,
        x: 20,
        scale: 0.95,
        ease: "none",
        scrollTrigger: {
          trigger: heroSection,
          start: "top top",
          end: "bottom top",
          scrub: 1.4
        }
      });
    }

    if (chip2) {
      gsap.to(chip2, {
        y: -75,
        x: -15,
        scale: 0.98,
        ease: "none",
        scrollTrigger: {
          trigger: heroSection,
          start: "top top",
          end: "bottom top",
          scrub: 0.8
        }
      });
    }

    if (chip3) {
      gsap.to(chip3, {
        y: -110,
        x: 10,
        scale: 0.94,
        ease: "none",
        scrollTrigger: {
          trigger: heroSection,
          start: "top top",
          end: "bottom top",
          scrub: 1.1
        }
      });
    }

    if (woodPlaque) {
      gsap.to(woodPlaque, {
        y: -45,
        ease: "none",
        scrollTrigger: {
          trigger: heroSection,
          start: "top top",
          end: "bottom top",
          scrub: 0.9
        }
      });
    }
  }

  // 1. SHOP PREVIEW
  const catItems = $$(".cat-circle-item");
  if (catItems.length) {
    gsap.fromTo(catItems, 
      { y: 35, rotation: (i) => [-8, 6, -5, 7, -4][i] || 0, scale: 0.92, opacity: 0.4 },
      {
        y: 0,
        rotation: 0,
        scale: 1,
        opacity: 1,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#shop-preview",
          start: "top 80%",
          end: "top 45%",
          scrub: 1
        }
      }
    );
  }

  // Why Mushrooms micro-cards stagger
  const whyCards = $$(".why-card");
  if (whyCards.length) {
    gsap.fromTo(whyCards,
      { y: 25, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.12,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#shop-preview",
          start: "top 75%"
        }
      }
    );
  }

  // 2. BENEFITS SECTION
  const basketImg = $(".benefits-basket-frame img");
  if (basketImg) {
    gsap.to(basketImg, {
      scale: 1.08,
      ease: "none",
      scrollTrigger: {
        trigger: "#benefits",
        start: "top bottom",
        end: "bottom top",
        scrub: true
      }
    });
  }

  const benefitRows = $$(".benefit-row-card");
  if (benefitRows.length) {
    gsap.fromTo(benefitRows,
      { x: 40, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        stagger: 0.12,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#benefits",
          start: "top 65%"
        }
      }
    );
  }

  // 3. ABOUT SECTION — ACCELERATED RESPONSIVE FARM JOURNEY SCROLL EFFECT
  const journeySteps = $$(".journey-step");
  const journeyStrip = $(".farm-journey-strip");
  if (journeySteps.length && journeyStrip) {
    ScrollTrigger.create({
      trigger: journeyStrip,
      start: "top 88%",
      end: "bottom 35%",
      onUpdate: (self) => {
        // Snappy, accelerated progression across the 5 steps as user scrolls
        const stepIdx = Math.min(Math.floor(self.progress * (journeySteps.length + 0.35)), journeySteps.length - 1);
        journeySteps.forEach((step, i) => {
          if (i <= stepIdx) {
            step.classList.add("active-step");
            step.style.background = "var(--olive)";
            step.style.color = "#FFFFFF";
            step.style.borderColor = "var(--olive)";
            step.style.transform = "translateY(-2px) scale(1.06)";
            step.style.boxShadow = "0 6px 16px rgba(113, 135, 47, 0.32)";
          } else {
            step.classList.remove("active-step");
            step.style.background = "var(--paper)";
            step.style.color = "var(--olive)";
            step.style.borderColor = "var(--line)";
            step.style.transform = "translateY(0) scale(1)";
            step.style.boxShadow = "var(--shadow-sm)";
          }
        });
      }
    });
  }


  const valueBoxes = $$(".value-box");
  if (valueBoxes.length) {
    gsap.fromTo(valueBoxes,
      { y: 30, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.14,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#about",
          start: "top 60%"
        }
      }
    );
  }

  // 4. BLOG / JOURNAL
  const featuredArticle = $(".featured-article-card");
  if (featuredArticle) {
    gsap.fromTo(featuredArticle,
      { y: 40, scale: 0.97, opacity: 0.4 },
      {
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 0.9,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#blog",
          start: "top 75%"
        }
      }
    );
  }

  const articleCards = $$(".article-card");
  if (articleCards.length) {
    gsap.fromTo(articleCards,
      { y: 35, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.15,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".blog-grid",
          start: "top 80%"
        }
      }
    );
  }

  // 5. CONTACT
  const contactItems = $$(".contact-item");
  const contactForm = $(".contact-form-card");
  if (contactItems.length && contactForm) {
    gsap.fromTo([...contactItems, contactForm],
      { y: 20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.1,
        duration: 0.7,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#contact",
          start: "top 80%"
        }
      }
    );
  }
}

// ==========================================
// 10. LENIS SMOOTH SCROLL INTEGRATION (SINGLE RAF)
// ==========================================
function initLenis() {
  if (typeof Lenis === "undefined") return;

  const lenis = new Lenis({
    duration: 0.85,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true
  });


  if (typeof ScrollTrigger !== "undefined" && typeof gsap !== "undefined") {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  } else {
    function fallbackRaf(time) {
      lenis.raf(time);
      requestAnimationFrame(fallbackRaf);
    }
    requestAnimationFrame(fallbackRaf);
  }
}

// ==========================================
// 11. ANIMATED STAT COUNTERS
// ==========================================
function setupCounters() {
  const statElements = $$(".stat-num");
  if (!statElements.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const targetVal = el.getAttribute("data-target");
        if (targetVal) {
          el.textContent = targetVal;
        }
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.3 });

  statElements.forEach(el => observer.observe(el));
}

// ==========================================
// 12. INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initLenis();
  updateCartCounters();
  renderDrawerCart();
  initCinematic3DHero();
  initMagneticElements();
  initSectionChoreography();
  setupCounters();
  initNavScrollSpy();

  if ($("#shopProductGrid")) {
    initShopFilters();
  }

  if ($("#fullCartList")) {
    renderFullCart();
  }

  // Header Scroll Shadow
  window.addEventListener("scroll", () => {
    const nav = $(".site-nav");
    if (nav) {
      if (window.scrollY > 40) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    }
  }, { passive: true });

  // Mobile Menu
  const menuToggle = $(".menu-toggle");
  const mobileMenu = $(".mobile-menu");
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("open");
      document.body.classList.toggle("no-scroll", isOpen);
    });
    $$(".mobile-menu a").forEach(a => {
      a.addEventListener("click", () => {
        mobileMenu.classList.remove("open");
        document.body.classList.remove("no-scroll");
      });
    });
  }

  // Drawer Triggers
  $$(".cart-trigger-btn").forEach(btn => {
    btn.addEventListener("click", openCartDrawer);
  });
  $(".close-drawer-btn")?.addEventListener("click", closeCartDrawer);
  $(".cart-drawer-overlay")?.addEventListener("click", e => {
    if (e.target === $(".cart-drawer-overlay")) closeCartDrawer();
  });

  // Search Triggers
  $$(".search-trigger-btn").forEach(btn => {
    btn.addEventListener("click", openSearchModal);
  });
  $(".modal-close-btn")?.addEventListener("click", closeSearchModal);
  $("#searchModal")?.addEventListener("click", e => {
    if (e.target === $("#searchModal")) closeSearchModal();
  });

  $("#searchLiveInput")?.addEventListener("input", e => {
    renderSearchResults(e.target.value);
  });

  // Keybindings: '/' for search, 'Esc' to close
  window.addEventListener("keydown", e => {
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openSearchModal();
    }
    if (e.key === "Escape") {
      closeSearchModal();
      closeCartDrawer();
    }
  });

  // Promo Code in Cart
  $("#applyPromoBtn")?.addEventListener("click", () => {
    const val = ($("#promoInput")?.value || "").trim().toUpperCase();
    if (val === "MUSH10") {
      appliedPromo = "MUSH10";
      localStorage.setItem("mushbio_promo", "MUSH10");
      showToast("Coupon MUSH10 Applied! 10% Discount Added.");
      renderFullCart();
    } else {
      showToast("Invalid Promo Code. Try MUSH10");
    }
  });

  // Contact Form
  $(".contact-form")?.addEventListener("submit", e => {
    e.preventDefault();
    showToast("Message sent! Our farm team will reach out soon.");
    e.target.reset();
  });
});

// ==========================================
// 13. ACTIVE NAVIGATION & SCROLL SPY
// ==========================================
function initNavScrollSpy() {
  const fullPath = window.location.pathname.toLowerCase();
  const navLinks = $$(".nav-links a, .mobile-menu a");

  // 1. If on Shop page (handles /shop, /shop.html, query params, or existence of shop elements)
  if (fullPath.includes("shop") || $("#shopProductGrid")) {
    navLinks.forEach(link => {
      const href = (link.getAttribute("href") || "").toLowerCase();
      if (href.includes("shop")) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
    return;
  }

  // 2. If on Cart page (handles /cart, /cart.html, or existence of cart elements)
  if (fullPath.includes("cart") || $("#fullCartList")) {
    navLinks.forEach(link => link.classList.remove("active"));
    return;
  }

  // 3. On Home Page (index.html, /, or section scroll)
  const sections = [
    { id: "home", selector: "#home, .home-hero" },
    { id: "benefits", selector: "#benefits, .benefits-section" },
    { id: "blog", selector: "#blog, .blog-section" },
    { id: "about", selector: "#about, .about-section" },
    { id: "contact", selector: "#contact, .contact-section" }
  ];

  function setActiveLink(sectionId) {
    navLinks.forEach(link => {
      const href = link.getAttribute("href") || "";
      let isMatch = false;

      if (sectionId === "home" && (href === "index.html" || href === "#home" || href === "/" || href === "")) {
        isMatch = true;
      } else if (href === `#${sectionId}` || href === `index.html#${sectionId}`) {
        isMatch = true;
      }

      if (isMatch) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  // Smooth click handler for in-page section links
  navLinks.forEach(link => {
    const href = link.getAttribute("href");
    if (href && (href.startsWith("#") || (href.startsWith("index.html#") && (fullPath.includes("index.html") || fullPath === "/" || fullPath.endsWith("/"))))) {
      const targetId = href.split("#")[1];
      link.addEventListener("click", e => {
        const targetSection = document.getElementById(targetId);
        if (targetSection) {
          e.preventDefault();
          const targetY = targetSection.getBoundingClientRect().top + window.pageYOffset - 72;
          window.scrollTo({ top: targetY, behavior: "smooth" });
          setActiveLink(targetId);
        }
      });
    }
  });

  // Dynamic Scroll Spy
  function onScrollSpy() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    // If near the bottom of the page, activate Contact
    if (scrollY + windowHeight >= documentHeight - 120) {
      setActiveLink("contact");
      return;
    }

    // Check each section from bottom to top
    for (let i = sections.length - 1; i >= 0; i--) {
      const sec = $(sections[i].selector);
      if (sec) {
        const top = sec.offsetTop - 140;
        if (scrollY >= top) {
          setActiveLink(sections[i].id);
          return;
        }
      }
    }

    setActiveLink("home");
  }

  window.addEventListener("scroll", onScrollSpy, { passive: true });
  onScrollSpy();
}

// ==========================================
// PHASE 10A: GPS-ASSISTED DELIVERY ADDRESS
// ==========================================

/** State for the currently selected delivery address */
let selectedDeliveryAddressId = null;

/** Helper: get the API base URL */
function getApiBase() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return `http://${host}:5001/mushbio-organics/asia-south1/api/api/v1`;
  }
  return "/api/v1";
}

/** Show a location status message */
function showLocationStatus(msg, type) {
  const el = document.getElementById("locationStatus");
  if (!el) return;
  el.style.display = "block";
  el.textContent = msg;
  el.style.background = type === "error" ? "#fee2e2" : type === "success" ? "#dcfce7" : "#eff6ff";
  el.style.color = type === "error" ? "#991b1b" : type === "success" ? "#166534" : "#1e40af";
  el.style.border = "1px solid " + (type === "error" ? "#fca5a5" : type === "success" ? "#86efac" : "#bfdbfe");
}

/** Load saved addresses for logged-in user into the dropdown */
async function loadSavedAddressesForCheckout() {
  const sel = document.getElementById("savedAddressSelect");
  if (!sel) return;

  try {
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      sel.innerHTML = '<option value="">Log in to see saved addresses</option>';
      return;
    }
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`${getApiBase()}/me/addresses`, {
      headers: { "Authorization": `Bearer ${idToken}` },
    });
    const data = await res.json();
    const addresses = data?.data || [];

    if (addresses.length === 0) {
      sel.innerHTML = '<option value="">No saved addresses — add one below</option>';
      return;
    }

    sel.innerHTML = addresses.map(a => {
      const label = `${a.label ? `[${a.label}] ` : ""}${a.recipientName} — ${a.line1}, ${a.city}${a.isDefault ? " ⭐" : ""}`;
      return `<option value="${a.id}">${label}</option>`;
    }).join("");

    // Pre-select the default address
    const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
    if (defaultAddr) {
      sel.value = defaultAddr.id;
      selectedDeliveryAddressId = defaultAddr.id;
    }

    sel.addEventListener("change", () => {
      selectedDeliveryAddressId = sel.value || null;
    });

  } catch (err) {
    console.error("Failed to load addresses:", err);
    sel.innerHTML = '<option value="">Unable to load addresses</option>';
  }
}

/** Handle "Use Current Location" button click */
async function handleUseCurrentLocation() {
  const btn = document.getElementById("useLocationBtn");
  const accuracyWarn = document.getElementById("accuracyWarning");

  if (!navigator.geolocation) {
    showLocationStatus("GPS is not supported by your browser. Please add your address manually.", "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "📍 Detecting location…";
  }
  showLocationStatus("Requesting your location…", "info");
  if (accuracyWarn) accuracyWarn.style.display = "none";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      showLocationStatus("Got your location — looking up address…", "info");

      // Show accuracy warning if > 100 meters
      if (accuracy > 100 && accuracyWarn) {
        accuracyWarn.style.display = "block";
      }

      // Set hidden GPS metadata fields
      const setField = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setField("addrLatitude", latitude);
      setField("addrLongitude", longitude);
      setField("addrAccuracy", Math.round(accuracy));
      setField("addrLocationSource", "GPS");

      // Call server-side reverse geocoding
      try {
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        const currentUser = getAuth().currentUser;

        if (!currentUser) {
          showLocationStatus("Please log in to use GPS address detection.", "error");
          if (btn) { btn.disabled = false; btn.textContent = "📍 Use Current Location"; }
          return;
        }

        const idToken = await currentUser.getIdToken();
        const geocodeRes = await fetch(`${getApiBase()}/locations/reverse-geocode`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ latitude, longitude, accuracyMeters: Math.round(accuracy) }),
        });

        const geocodeData = await geocodeRes.json();

        if (!geocodeRes.ok) {
          if (geocodeRes.status === 429) {
            showLocationStatus("Please wait a moment before requesting location again.", "error");
          } else if (geocodeRes.status === 422) {
            showLocationStatus("No address found. Please enter your address manually.", "error");
          } else if (geocodeRes.status === 503) {
            showLocationStatus("Location service temporarily unavailable. Please enter address manually.", "error");
          } else {
            showLocationStatus("Could not look up address. Please enter manually.", "error");
          }
          if (btn) { btn.disabled = false; btn.textContent = "📍 Use Current Location"; }
          handleAddNewAddress(); // Open blank form
          return;
        }

        const addr = geocodeData.data;
        // Pre-fill the address form fields
        const fill = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
        fill("addrLine1", addr.line1);
        fill("addrLine2", addr.line2 || "");
        fill("addrCity", addr.city);
        fill("addrState", addr.state);
        fill("addrPostalCode", addr.postalCode);
        fill("addrCountry", addr.country || "IN");

        // Show form for user to confirm/edit
        const form = document.getElementById("gpsAddressForm");
        if (form) form.style.display = "block";
        showLocationStatus("✓ Location detected. Please verify and save your address.", "success");

      } catch (err) {
        console.error("Reverse geocode error:", err);
        showLocationStatus("Location lookup failed. Please enter your address manually.", "error");
        handleAddNewAddress();
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "📍 Use Current Location"; }
      }
    },
    (error) => {
      if (btn) { btn.disabled = false; btn.textContent = "📍 Use Current Location"; }
      const ERRORS = {
        1: "Location permission denied. Please allow location access and try again.",
        2: "Your location is currently unavailable. Please enter your address manually.",
        3: "Location request timed out. Please try again or enter manually.",
      };
      showLocationStatus(ERRORS[error.code] || "Unable to get location.", "error");
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

/** Handle "Add New Address" button click — opens blank form */
function handleAddNewAddress() {
  const form = document.getElementById("gpsAddressForm");
  if (form) {
    form.style.display = "block";
    // Clear all fields
    ["addrRecipientName", "addrPhone", "addrLine1", "addrLine2", "addrCity",
     "addrState", "addrPostalCode", "addrInstructions"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const countryEl = document.getElementById("addrCountry");
    if (countryEl) countryEl.value = "IN";
    const sourceEl = document.getElementById("addrLocationSource");
    if (sourceEl) sourceEl.value = "MANUAL";
    ["addrLatitude", "addrLongitude", "addrAccuracy"].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = "";
    });
  }
  const locationStatus = document.getElementById("locationStatus");
  if (locationStatus) locationStatus.style.display = "none";
}

/** Handle address form save */
async function handleSaveGPSAddress() {
  const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

  const recipientName = get("addrRecipientName");
  const phone = get("addrPhone");
  const line1 = get("addrLine1");
  const city = get("addrCity");
  const state = get("addrState");
  const postalCode = get("addrPostalCode");

  if (!recipientName || !phone || !line1 || !city || !state || !postalCode) {
    showLocationStatus("Please fill in all required fields (*).", "error");
    return;
  }

  const latStr = get("addrLatitude");
  const lngStr = get("addrLongitude");
  const accuracyStr = get("addrAccuracy");
  const locationSource = get("addrLocationSource") || "MANUAL";

  const addressPayload = {
    recipientName,
    phone,
    line1,
    line2: get("addrLine2") || undefined,
    city,
    state,
    postalCode,
    country: get("addrCountry") || "IN",
    deliveryInstructions: get("addrInstructions") || undefined,
    isDefault: false,
    locationSource,
  };

  if (latStr && lngStr) {
    addressPayload.latitude = parseFloat(latStr);
    addressPayload.longitude = parseFloat(lngStr);
    if (accuracyStr) addressPayload.accuracyMeters = parseFloat(accuracyStr);
  }

  try {
    showLocationStatus("Saving address…", "info");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      showLocationStatus("Please log in to save your address.", "error");
      return;
    }
    const idToken = await currentUser.getIdToken();

    const res = await fetch(`${getApiBase()}/me/addresses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify(addressPayload),
    });

    const data = await res.json();
    if (!res.ok) {
      showLocationStatus(data?.message || "Failed to save address.", "error");
      return;
    }

    const savedAddr = data.data;
    selectedDeliveryAddressId = savedAddr.id;

    // Reload the selector dropdown
    await loadSavedAddressesForCheckout();
    const sel = document.getElementById("savedAddressSelect");
    if (sel && selectedDeliveryAddressId) sel.value = selectedDeliveryAddressId;

    // Hide form
    const form = document.getElementById("gpsAddressForm");
    if (form) form.style.display = "none";

    showLocationStatus("✓ Address saved! Ready to proceed.", "success");

  } catch (err) {
    console.error("Save address error:", err);
    showLocationStatus("Failed to save address. Please try again.", "error");
  }
}

/** Handle address form cancel */
function handleCancelAddressForm() {
  const form = document.getElementById("gpsAddressForm");
  if (form) form.style.display = "none";
  const locationStatus = document.getElementById("locationStatus");
  if (locationStatus) locationStatus.style.display = "none";
  const accuracyWarn = document.getElementById("accuracyWarning");
  if (accuracyWarn) accuracyWarn.style.display = "none";
}

/** Initialize GPS address section on cart page */
function initDeliveryAddressSection() {
  if (!document.getElementById("deliveryAddressSection")) return;
  loadSavedAddressesForCheckout();
}

// Auto-init on DOMContentLoaded if on cart page
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("cart") || document.getElementById("deliveryAddressSection")) {
    initDeliveryAddressSection();
  }
}, { once: false }); // Allow multiple DOMContentLoaded listeners

// ==========================================
// PHASE 10: RAZORPAY CHECKOUT FLOW
// ==========================================

/**
 * handleProceedToCheckout
 * 
 * Server-side authoritative checkout flow:
 * 1. Validate auth state
 * 2. Sync cart to server
 * 3. Create order via server (uses selected address from GPS/dropdown)
 * 4. Get Razorpay payment session from server (authoritative amount, INR paise)
 * 5. Open Razorpay modal
 * 6. Verify HMAC signature server-side
 * 7. Show success / redirect
 */
async function handleProceedToCheckout() {

  const btn = document.getElementById("proceedToCheckoutBtn");
  const statusBanner = document.getElementById("checkoutStatusBanner");

  function setStatus(msg, type) {
    if (!statusBanner) return;
    statusBanner.style.display = "block";
    statusBanner.textContent = msg;
    statusBanner.style.background = type === "error" ? "#fee2e2" : type === "success" ? "#dcfce7" : "#f0fdf4";
    statusBanner.style.color = type === "error" ? "#991b1b" : type === "success" ? "#166534" : "#365314";
    statusBanner.style.border = "1px solid " + (type === "error" ? "#fca5a5" : "#86efac");
  }

  function setBusy(busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? "Processing…" : "Proceed to Checkout";
  }

  try {
    setBusy(true);
    setStatus("Checking authentication…", "info");

    // 1. Get Firebase auth token (requires Phase 05 Firebase auth)
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setStatus("Please log in to proceed to checkout.", "error");
      setBusy(false);
      showToast("Login required to checkout");
      // Redirect to auth page after short delay
      setTimeout(() => { window.location.href = "index.html#auth"; }, 1500);
      return;
    }

    const idToken = await currentUser.getIdToken();

    // 2. Ensure cart is non-empty
    if (!cart || cart.length === 0) {
      setStatus("Your cart is empty. Add items before checkout.", "error");
      setBusy(false);
      return;
    }

    setStatus("Syncing cart with server…", "info");

    // 3. Determine base API URL (shared helper from Phase 10A)
    const API_BASE = getApiBase();

    // 4. Sync local localStorage cart items to server cart
    for (const item of cart) {
      await fetch(`${API_BASE}/cart/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          productId: item.productId || String(item.id),
          variantId: item.variantId || `var_${item.id}_default`,
          quantity: item.qty,
        }),
      });
    }

    setStatus("Creating your order…", "info");

    // 5. Determine address to use — prefer the one selected in the GPS/dropdown flow
    let addressId = selectedDeliveryAddressId;

    // If no address selected via dropdown, fall back to fetching default
    if (!addressId) {
      const addrRes = await fetch(`${getApiBase()}/me/addresses`, {
        headers: { "Authorization": `Bearer ${idToken}` },
      });
      const addrData = await addrRes.json();
      const defaultAddr = addrData?.data?.find(a => a.isDefault) || addrData?.data?.[0];

      if (!defaultAddr) {
        setStatus("Please add a shipping address before checkout.", "error");
        setBusy(false);
        showToast("Add a delivery address first");
        return;
      }
      addressId = defaultAddr.id;
    }

    // 6. Get delivery instructions from the address form (if visible)
    const deliveryInstructionsEl = document.getElementById("addrInstructions");
    const deliveryInstructions = deliveryInstructionsEl ? deliveryInstructionsEl.value.trim() : undefined;

    // 7. Create order
    const orderRes = await fetch(`${getApiBase()}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        addressId,
        shippingMethod: "STANDARD",
        ...(deliveryInstructions && { deliveryInstructions }),
      }),
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      const errMsg = orderData?.message || "Failed to create order";
      setStatus(errMsg, "error");
      setBusy(false);
      showToast(errMsg);
      return;
    }
    const order = orderData.data;

    setStatus("Connecting to secure payment gateway…", "info");

    // 7. Request Razorpay checkout session from server (authoritative amount in paise)
    const payRes = await fetch(`${API_BASE}/payments/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`,
      },
      body: JSON.stringify({ orderId: order.id }),
    });

    const payData = await payRes.json();
    if (!payRes.ok) {
      const errMsg = payData?.message || "Payment setup failed";
      setStatus(errMsg, "error");
      setBusy(false);
      showToast(errMsg);
      return;
    }

    const checkoutData = payData.data;

    // 8. Load Razorpay script dynamically
    setStatus("Opening Razorpay Checkout…", "info");
    const scriptLoaded = await new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

    if (!scriptLoaded) {
      setStatus("Unable to load Razorpay. Check your internet connection.", "error");
      setBusy(false);
      return;
    }

    setBusy(false);

    // 9. Open Razorpay modal (amount comes from server in paise - authoritative)
    const rzpOptions = {
      key: checkoutData.razorpayKeyId, // Public key only — never the secret
      amount: checkoutData.amount,     // Integer paise from server
      currency: checkoutData.currency || "INR",
      name: "MushBio Organics",
      description: `Order ${checkoutData.orderNumber || order.orderNumber}`,
      order_id: checkoutData.razorpayOrderId,
      prefill: checkoutData.prefill || {},
      theme: { color: "#2e7d32" },
      modal: {
        ondismiss: function () {
          setStatus("Payment cancelled. You can try again.", "error");
          setBusy(false);
        },
      },
      handler: async function (rzpResponse) {
        try {
          setStatus("Verifying payment security…", "info");
          setBusy(true);

          // 10. Send signature to server for HMAC-SHA256 verification
          const verifyRes = await fetch(`${API_BASE}/payments/verify`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              razorpayOrderId: rzpResponse.razorpay_order_id,
              razorpayPaymentId: rzpResponse.razorpay_payment_id,
              razorpaySignature: rzpResponse.razorpay_signature,
            }),
          });

          const verifyData = await verifyRes.json();

          if (!verifyRes.ok || !verifyData.data?.success) {
            setStatus("Payment verification failed. Please contact support.", "error");
            setBusy(false);
            return;
          }

          // 11. Payment confirmed — clear local cart and show success
          setStatus("🎉 Payment successful! Order confirmed.", "success");
          cart = [];
          saveCart();

          showToast(`Order #${verifyData.data.orderNumber} confirmed!`);

          setTimeout(() => {
            window.location.href = `index.html?order=success&id=${order.id}`;
          }, 2000);
        } catch (err) {
          setStatus("Verification error. Contact support if payment was deducted.", "error");
          setBusy(false);
        }
      },
    };

    const rzp = new window.Razorpay(rzpOptions);
    rzp.on("payment.failed", function (failResponse) {
      setStatus(`Payment failed: ${failResponse.error?.description || "Unknown error"}`, "error");
      setBusy(false);
    });
    rzp.open();

  } catch (err) {
    console.error("Checkout error:", err);
    setStatus("Checkout error. Please try again.", "error");
    setBusy(false);
    showToast("Checkout failed. Please try again.");
  }
}
