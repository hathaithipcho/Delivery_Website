/**
 * ============================================================================
 * ส่งตรง เดลิเวอรี่ (FastDrop Delivery) - JavaScript หลัก
 * เว็บไซต์บริการส่งของหน้าเดียว (Single Page Application - Vanilla JS)
 * ============================================================================
 * 
 * สารบัญฟังก์ชัน:
 * 1. CONFIGURATION (ตั้งค่า API Key และ อัตราค่าบริการ)
 * 2. AUTHENTICATION (ระบบเข้าสู่ระบบ / สมัครสมาชิก / LocalStorage / SHA-256)
 * 3. GOOGLE MAPS & PIN SYSTEM (ระบบแผนที่ ปักหมุด คำนวณเส้นทาง และ Autocomplete)
 * 4. PRICING SYSTEM (ระบบคำนวณราคา Real-time)
 * 5. ORDER FORM & VALIDATION (ตรวจสอบข้อมูล และส่งคำสั่งซื้อ)
 * 6. VIDEO & ACCESSIBILITY (จัดการวิดีโอพื้นหลังและ prefers-reduced-motion)
 */

/* ============================================================================
 * 1. CONFIGURATION: การตั้งค่าระบบ (คุณสามารถแก้ไขจุดนี้ได้โดยตรง)
 * ============================================================================ */

/**
 * 🔑 1.1 ใส่ Google Maps API Key ของคุณที่นี่
 * - ต้องเปิดใช้งาน Maps JavaScript API, Places API, Directions API และ Geocoding API
 * - ถ้ายังไม่ใส่ หรือใส่เป็นค่าว่าง แผนที่จะเปิด "โหมดจำลอง (Demo Mode)" อัตโนมัติ เพื่อไม่ให้เว็บพัง
 */
const GOOGLE_MAPS_API_KEY = ""; // ตัวอย่าง: "AIzaSyD-xxxxxxxxxxxxxxxxxxxx"

/**
 * 💰 1.2 กำหนดอัตราค่าบริการ (แก้ไขราคาได้ที่นี่)
 * - base: ราคาเริ่มต้นตามขนาดพัสดุ (บาท)
 * - perKm: ค่าบริการตามระยะทางจริง (บาทต่อกิโลเมตร)
 */
const PRICING = {
  base: {
    S: 30, // ขนาด S: ซองเอกสาร / ของชิ้นเล็ก (บาท)
    M: 50, // ขนาด M: กล่องเล็ก / เสื้อผ้า / อาหาร (บาท)
    L: 80  // ขนาด L: กล่องใหญ่ / เครื่องใช้ไฟฟ้า (บาท)
  },
  perKm: 8 // คิดเพิ่ม 8 บาท ต่อกิโลเมตร
};

// คำอธิบายขนาดพัสดุ
const SIZE_DESCRIPTIONS = {
  S: "ซองเอกสาร / ของชิ้นเล็ก (ไม่เกิน 1 กก.)",
  M: "กล่องเล็ก / เสื้อผ้า (ไม่เกิน 5 กก.)",
  L: "กล่องใหญ่ / เครื่องใช้ไฟฟ้า (ไม่เกิน 15 กก.)"
};

/* ============================================================================
 * ตัวแปรสถานะส่วนกลาง (State Management)
 * ============================================================================ */
const state = {
  currentUser: null,           // ข้อมูลผู้ใช้ที่ล็อกอินอยู่
  selectedSize: "M",           // ขนาดพัสดุที่เลือก (ค่าเริ่มต้น: M)
  distanceKm: 0,               // ระยะทางคำนวณได้ (กม.)
  pickupLocation: null,        // พิกัดจุดรับ { lat, lng, address }
  dropoffLocation: null,       // พิกัดจุดส่ง { lat, lng, address }
  mapLoaded: false             // สถานะโหลด Google Maps
};

// ฟังก์ชันช่วยเลือก Element
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

/* ============================================================================
 * 2. AUTHENTICATION: ระบบสมาชิกและเข้าสู่ระบบ
 * ============================================================================
 * เวอร์ชันทดลองนี้จะเก็บข้อมูลใน localStorage ของเบราว์เซอร์
 * และแฮชรหัสผ่านด้วย Web Crypto API (SHA-256)
 * ============================================================================ */

// ตัวช่วยจัดการ LocalStorage
const storage = {
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.warn("Storage read error:", e);
      return defaultValue;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Storage write error:", e);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }
};

/**
 * แฮชรหัสผ่านด้วย SHA-256 ผ่าน Web Crypto API
 */
async function hashPassword(text) {
  if (window.crypto && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback กรณีสภาพแวดล้อมไม่รองรับ subtle crypto
  return btoa(encodeURIComponent(text));
}

/**
 * ----------------------------------------------------------------------------
 * 🟢 ฟังก์ชัน doRegister: สมัครสมาชิก
 * ----------------------------------------------------------------------------
 * 💡 คำแนะนำสำหรับการเปลี่ยนไปเรียก Backend API จริง:
 * แทนที่โค้ดในฟังก์ชันนี้ด้วย:
 * 
 * const response = await fetch("https://your-api.com/api/register", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ name, email, password })
 * });
 * const data = await response.json();
 * if (!response.ok) throw new Error(data.message || "เกิดข้อผิดพลาดในการสมัคร");
 * return data.user;
 * ----------------------------------------------------------------------------
 */
async function doRegister(name, email, password) {
  const users = storage.get("ds_users", {});
  const cleanEmail = email.trim().toLowerCase();

  // ตรวจสอบว่ามีอีเมลนี้ในระบบแล้วหรือยัง
  if (users[cleanEmail]) {
    throw new Error("อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบ");
  }

  // แฮชรหัสผ่านก่อนบันทึก
  const hashedPassword = await hashPassword(password);

  // บันทึกผู้ใช้ใหม่
  users[cleanEmail] = {
    name: name.trim(),
    email: cleanEmail,
    passwordHash: hashedPassword,
    registeredAt: new Date().toISOString()
  };
  storage.set("ds_users", users);

  // สร้างเซสชัน
  const sessionUser = { name: name.trim(), email: cleanEmail };
  storage.set("ds_session", sessionUser);
  return sessionUser;
}

/**
 * ----------------------------------------------------------------------------
 * 🟢 ฟังก์ชัน doLogin: เข้าสู่ระบบ
 * ----------------------------------------------------------------------------
 * 💡 คำแนะนำสำหรับการเปลี่ยนไปเรียก Backend API จริง:
 * แทนที่โค้ดในฟังก์ชันนี้ด้วย:
 * 
 * const response = await fetch("https://your-api.com/api/login", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ email, password })
 * });
 * const data = await response.json();
 * if (!response.ok) throw new Error(data.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
 * return data.user;
 * ----------------------------------------------------------------------------
 */
async function doLogin(email, password) {
  const users = storage.get("ds_users", {});
  const cleanEmail = email.trim().toLowerCase();
  const user = users[cleanEmail];

  if (!user) {
    throw new Error("ไม่พบอีเมลนี้ในระบบ กรุณาสมัครสมาชิก");
  }

  const hashedPassword = await hashPassword(password);
  if (user.passwordHash !== hashedPassword) {
    throw new Error("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
  }

  // บันทึกเซสชัน
  const sessionUser = { name: user.name, email: user.email };
  storage.set("ds_session", sessionUser);
  return sessionUser;
}

/**
 * ออกจากระบบ
 */
function doLogout() {
  storage.remove("ds_session");
  state.currentUser = null;
  updateAuthUI();
  showToast("ออกจากระบบเรียบร้อยแล้ว");
}

/**
 * อัปเดตการแสดงผล Navbar ตามสถานะการล็อกอิน
 */
function updateAuthUI() {
  const sessionUser = storage.get("ds_session", null);
  state.currentUser = sessionUser;

  const loginBtn = $("#loginNavBtn");
  const logoutBtn = $("#logoutNavBtn");
  const greeting = $("#userGreeting");

  if (sessionUser) {
    greeting.textContent = `สวัสดี คุณ${sessionUser.name}`;
    greeting.hidden = false;
    logoutBtn.hidden = false;
    loginBtn.hidden = true;
  } else {
    greeting.hidden = true;
    logoutBtn.hidden = true;
    loginBtn.hidden = false;
  }
}

// จัดการ Modal Login
let authModalMode = "login"; // "login" หรือ "register"

function openAuthModal(mode = "login", customMessage = "") {
  authModalMode = mode;
  setAuthTab(mode);
  
  const errorEl = $("#authErrorMsg");
  errorEl.textContent = customMessage;
  if (customMessage) {
    errorEl.style.color = "var(--primary-hover)";
  } else {
    errorEl.style.color = "var(--danger)";
  }

  $("#authModal").removeAttribute("hidden");
  if (mode === "register") {
    $("#authName").focus();
  } else {
    $("#authEmail").focus();
  }
}

function closeAuthModal() {
  $("#authModal").setAttribute("hidden", "true");
  $("#authForm").reset();
  $("#authErrorMsg").textContent = "";
}

function setAuthTab(mode) {
  authModalMode = mode;
  const isLogin = mode === "login";

  $("#tabLogin").classList.toggle("active", isLogin);
  $("#tabLogin").setAttribute("aria-selected", isLogin);

  $("#tabRegister").classList.toggle("active", !isLogin);
  $("#tabRegister").setAttribute("aria-selected", !isLogin);

  $("#nameFieldGroup").hidden = isLogin;
  $("#authModalTitle").textContent = isLogin ? "เข้าสู่ระบบผู้ใช้งาน" : "สมัครสมาชิกใหม่";
  $("#authSubmitBtn").textContent = isLogin ? "เข้าสู่ระบบ" : "ยืนยันการสมัครสมาชิก";
  $("#authErrorMsg").textContent = "";
}

// ผูก Event ให้กับ Modal Auth
$("#loginNavBtn").addEventListener("click", () => openAuthModal("login"));
$("#logoutNavBtn").addEventListener("click", doLogout);
$("#closeAuthBtn").addEventListener("click", closeAuthModal);
$("#authModal").addEventListener("click", (e) => {
  if (e.target === $("#authModal")) closeAuthModal();
});

$("#tabLogin").addEventListener("click", () => setAuthTab("login"));
$("#tabRegister").addEventListener("click", () => setAuthTab("register"));

// ส่งฟอร์ม Login / Register
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#authName").value.trim();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const errorEl = $("#authErrorMsg");
  errorEl.style.color = "var(--danger)";

  // ตรวจสอบความถูกต้องเบื้องต้น (Validation)
  if (authModalMode === "register" && !name) {
    errorEl.textContent = "กรุณากรอกชื่อ-นามสกุลของคุณ";
    $("#authName").focus();
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errorEl.textContent = "กรุณากรอกอีเมลให้ถูกต้อง (เช่น name@example.com)";
    $("#authEmail").focus();
    return;
  }

  if (!password || password.length < 6) {
    errorEl.textContent = "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
    $("#authPassword").focus();
    return;
  }

  try {
    errorEl.textContent = "กำลังดำเนินการ...";
    if (authModalMode === "login") {
      await doLogin(email, password);
      showToast("เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ!");
    } else {
      await doRegister(name, email, password);
      showToast("สมัครสมาชิกและเข้าสู่ระบบสำเร็จ!");
    }
    closeAuthModal();
    updateAuthUI();

    // ซ่อน Alert เตือนเข้าสู่ระบบที่การ์ดสั่งซื้อ (ถ้ามี)
    $("#orderFormAlert").hidden = true;
  } catch (err) {
    errorEl.textContent = err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
  }
});

/* ============================================================================
 * 3. GOOGLE MAPS & PIN SYSTEM: แผนที่ ปักหมุด และคำนวณเส้นทาง
 * ============================================================================ */
let map = null;
let geocoder = null;
let directionsService = null;
let directionsRenderer = null;
let pickupMarker = null;
let dropoffMarker = null;

// พิกัดเริ่มต้น: อนุสาวรีย์ชัยสมรภูมิ กรุงเทพมหานคร
const DEFAULT_CENTER = { lat: 13.7649, lng: 100.5383 };

/**
 * ฟังก์ชันเริ่มต้น Google Maps
 */
function initGoogleMap() {
  state.mapLoaded = true;
  const mapElement = $("#map");
  $("#apiKeyNotice").hidden = true;

  // 1. สร้าง Map Instance
  map = new google.maps.Map(mapElement, {
    center: DEFAULT_CENTER,
    zoom: 13,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
    styles: [
      { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
    ]
  });

  // 2. สร้าง Services
  geocoder = new google.maps.Geocoder();
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true, // ซ่อนหมุดเริ่มต้นของ Directions เพื่อใช้ Custom Pin ของเรา
    polylineOptions: {
      strokeColor: "#0284c7",
      strokeWeight: 5,
      strokeOpacity: 0.85
    }
  });

  // 3. จัดการการคลิกบนแผนที่เพื่อปักหมุด
  map.addListener("click", (event) => {
    handleMapClick(event.latLng);
  });

  // 4. เชื่อมต่อ Autocomplete กับช่อง Input
  setupAutocomplete();
  updatePinStatusText();
}

/**
 * จัดการเมื่อคลิกบนแผนที่
 * - คลิกครั้งที่ 1 -> ปักหมุดจุดรับ (สีเขียว A)
 * - คลิกครั้งที่ 2 -> ปักหมุดจุดส่ง (สีแดง B)
 */
function handleMapClick(latLng) {
  if (!pickupMarker) {
    // ปักหมุดจุดรับ
    setPickupPin(latLng, true);
  } else if (!dropoffMarker) {
    // ปักหมุดจุดส่ง
    setDropoffPin(latLng, true);
  } else {
    // ถ้ามีครบทั้งสองจุดแล้ว คลิกอีกครั้งจะเป็นการย้ายจุดส่ง
    setDropoffPin(latLng, true);
  }
}

/**
 * ปักหมุดจุดรับ (Pickup Marker)
 */
function setPickupPin(latLng, shouldGeocode = true) {
  const pos = {
    lat: typeof latLng.lat === "function" ? latLng.lat() : latLng.lat,
    lng: typeof latLng.lng === "function" ? latLng.lng() : latLng.lng
  };

  if (!pickupMarker) {
    // สร้างหมุดใหม่
    pickupMarker = new google.maps.Marker({
      position: pos,
      map: map,
      draggable: true,
      label: {
        text: "A",
        color: "#ffffff",
        fontWeight: "bold"
      },
      icon: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: "#10b981", // สีเขียว
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      },
      title: "จุดรับพัสดุ (ลากเพื่อปรับตำแหน่ง)"
    });

    // ดักจับเมื่อลากหมุดเสร็จ
    pickupMarker.addListener("dragend", () => {
      const newPos = pickupMarker.getPosition();
      setPickupPin(newPos, true);
    });
  } else {
    pickupMarker.setPosition(pos);
  }

  state.pickupLocation = { lat: pos.lat, lng: pos.lng, address: $("#pickupInput").value };

  if (shouldGeocode) {
    reverseGeocode(pos, (address) => {
      $("#pickupInput").value = address;
      state.pickupLocation.address = address;
    });
  }

  updatePinStatusText();
  calculateRoute();
}

/**
 * ปักหมุดจุดส่ง (Dropoff Marker)
 */
function setDropoffPin(latLng, shouldGeocode = true) {
  const pos = {
    lat: typeof latLng.lat === "function" ? latLng.lat() : latLng.lat,
    lng: typeof latLng.lng === "function" ? latLng.lng() : latLng.lng
  };

  if (!dropoffMarker) {
    // สร้างหมุดใหม่
    dropoffMarker = new google.maps.Marker({
      position: pos,
      map: map,
      draggable: true,
      label: {
        text: "B",
        color: "#ffffff",
        fontWeight: "bold"
      },
      icon: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: "#ef4444", // สีแดง
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      },
      title: "จุดส่งพัสดุ (ลากเพื่อปรับตำแหน่ง)"
    });

    // ดักจับเมื่อลากหมุดเสร็จ
    dropoffMarker.addListener("dragend", () => {
      const newPos = dropoffMarker.getPosition();
      setDropoffPin(newPos, true);
    });
  } else {
    dropoffMarker.setPosition(pos);
  }

  state.dropoffLocation = { lat: pos.lat, lng: pos.lng, address: $("#dropoffInput").value };

  if (shouldGeocode) {
    reverseGeocode(pos, (address) => {
      $("#dropoffInput").value = address;
      state.dropoffLocation.address = address;
    });
  }

  updatePinStatusText();
  calculateRoute();
}

/**
 * แปลงพิกัดเป็นชื่อที่อยู่ภาษาไทย (Reverse Geocoding)
 */
function reverseGeocode(latLng, callback) {
  if (!geocoder) return;
  geocoder.geocode({ location: latLng, language: "th" }, (results, status) => {
    if (status === "OK" && results[0]) {
      callback(results[0].formatted_address);
    } else {
      callback(`พิกัด: ${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}`);
    }
  });
}

/**
 * คำนวณเส้นทางและระยะทาง (Directions Service)
 */
function calculateRoute() {
  if (!pickupMarker || !dropoffMarker || !directionsService) return;

  const origin = pickupMarker.getPosition();
  const destination = dropoffMarker.getPosition();

  $("#mapLoader").hidden = false;

  directionsService.route(
    {
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode.DRIVING
    },
    (result, status) => {
      $("#mapLoader").hidden = true;
      if (status === google.maps.DirectionsStatus.OK) {
        directionsRenderer.setDirections(result);
        const route = result.routes[0];
        if (route && route.legs && route.legs[0]) {
          const leg = route.legs[0];
          // ระยะทางเป็นกิโลเมตร
          const distanceInKm = leg.distance.value / 1000;
          state.distanceKm = Number(distanceInKm.toFixed(1));
          updatePricingDisplay();
        }
      } else {
        console.warn("Directions request failed:", status);
        // Fallback: ใช้การคำนวณระยะทางเส้นตรงแบบ Haversine
        const straightDistance = calculateHaversineDistance(
          origin.lat(), origin.lng(), destination.lat(), destination.lng()
        );
        state.distanceKm = Number((straightDistance * 1.3).toFixed(1)); // คูณ 1.3 เผื่อความคดเคี้ยวของถนน
        updatePricingDisplay();
      }
    }
  );
}

/**
 * คำนวณระยะทาง Haversine Formula (กิโลเมตร) สำรอง
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // รัศมีโลกในหน่วย กม.
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * ตั้งค่า Autocomplete สำหรับช่องค้นหาที่อยู่
 */
function setupAutocomplete() {
  if (!window.google || !google.maps || !google.maps.places) return;

  const options = {
    componentRestrictions: { country: "th" },
    fields: ["formatted_address", "geometry", "name"]
  };

  const pickupInput = $("#pickupInput");
  const dropoffInput = $("#dropoffInput");

  const pickupAuto = new google.maps.places.Autocomplete(pickupInput, options);
  pickupAuto.addListener("place_changed", () => {
    const place = pickupAuto.getPlace();
    if (place.geometry && place.geometry.location) {
      map.panTo(place.geometry.location);
      map.setZoom(15);
      setPickupPin(place.geometry.location, false);
      state.pickupLocation.address = place.formatted_address || place.name;
    }
  });

  const dropoffAuto = new google.maps.places.Autocomplete(dropoffInput, options);
  dropoffAuto.addListener("place_changed", () => {
    const place = dropoffAuto.getPlace();
    if (place.geometry && place.geometry.location) {
      map.panTo(place.geometry.location);
      map.setZoom(15);
      setDropoffPin(place.geometry.location, false);
      state.dropoffLocation.address = place.formatted_address || place.name;
    }
  });
}

/**
 * ล้างหมุดและเส้นทางบนแผนที่ทั้งหมด
 */
function clearMapPins() {
  if (pickupMarker) {
    pickupMarker.setMap(null);
    pickupMarker = null;
  }
  if (dropoffMarker) {
    dropoffMarker.setMap(null);
    dropoffMarker = null;
  }
  if (directionsRenderer) {
    directionsRenderer.set("directions", null);
  }

  state.pickupLocation = null;
  state.dropoffLocation = null;
  state.distanceKm = 0;

  $("#pickupInput").value = "";
  $("#dropoffInput").value = "";

  updatePinStatusText();
  updatePricingDisplay();
  showToast("ล้างหมุดและข้อมูลสถานที่แล้ว");
}

/**
 * อัปเดตข้อความแถบสถานะการปักหมุด
 */
function updatePinStatusText() {
  const statusEl = $("#pinStatusText");
  if (!pickupMarker && !dropoffMarker) {
    statusEl.innerHTML = 'คลิกบนแผนที่เพื่อปักหมุด <strong>"จุดรับ"</strong> (จุดที่ 1 สีเขียว)';
  } else if (pickupMarker && !dropoffMarker) {
    statusEl.innerHTML = 'คลิกบนแผนที่เพื่อปักหมุด <strong>"จุดส่ง"</strong> (จุดที่ 2 สีแดง)';
  } else {
    statusEl.innerHTML = '✅ <strong>ปักหมุดครบแล้ว</strong> (สามารถลากหมุด A หรือ B เพื่อปรับตำแหน่งได้)';
  }
}

/**
 * ใช้งานตำแหน่งปัจจุบันของฉันผ่าน Geolocation API
 */
function useCurrentLocationForPickup() {
  if (!navigator.geolocation) {
    alert("เบราว์เซอร์ของคุณไม่รองรับการดึงตำแหน่งปัจจุบัน");
    return;
  }

  showToast("กำลังดึงพิกัดตำแหน่งของคุณ...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const latLng = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      if (map) {
        map.panTo(latLng);
        map.setZoom(16);
        setPickupPin(latLng, true);
        showToast("ปักหมุดจุดรับ ณ ตำแหน่งปัจจุบันของคุณแล้ว");
      } else {
        // Fallback กรณีไม่มี Google Maps Key
        state.pickupLocation = {
          lat: latLng.lat,
          lng: latLng.lng,
          address: "ตำแหน่งปัจจุบันของคุณ (GPS)"
        };
        $("#pickupInput").value = state.pickupLocation.address;
        showToast("ระบุตำแหน่งปัจจุบันแล้ว");
      }
    },
    (err) => {
      console.warn("Geolocation error:", err);
      alert("ไม่สามารถระบุตำแหน่งได้ กรุณาอนุญาตการเข้าถึงพิกัดในเบราว์เซอร์ของคุณ");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/**
 * โหลด Google Maps JavaScript API แบบไดนามิก
 */
function loadGoogleMapsScript() {
  // หากไม่มี API Key ให้เปิด Fallback Notice เพื่อให้ผู้ใช้ทราบวิธีใส่ Key
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "YOUR_API_KEY_HERE" || GOOGLE_MAPS_API_KEY.trim() === "") {
    showApiKeyNotice();
    return;
  }

  window.gm_authFailure = () => {
    console.error("Google Maps API Authentication Failed!");
    showApiKeyNotice(true);
  };

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry&language=th&callback=initGoogleMap`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    console.error("Failed to load Google Maps script");
    showApiKeyNotice();
  };
  document.head.appendChild(script);
}

/**
 * แสดงกล่องแจ้งเตือน API Key และเตรียม Demo Mode
 */
function showApiKeyNotice(isAuthError = false) {
  const notice = $("#apiKeyNotice");
  if (!notice) return;
  notice.hidden = false;
  if (isAuthError) {
    notice.querySelector("h4").textContent = "Google Maps API Key ไม่ถูกต้อง หรือจำกัดสิทธิ์";
  }
}

/**
 * โหมดจำลอง Demo (เมื่อยังไม่ได้ใส่ Google Maps API Key)
 */
function runDemoSimulation() {
  // สยามพารากอน -> ตลาดนัดจตุจักร (~8.5 กม.)
  const siam = { lat: 13.7466, lng: 100.5347, address: "สยามพารากอน แขวงปทุมวัน เขตปทุมวัน กรุงเทพฯ" };
  const chatuchak = { lat: 13.7999, lng: 100.5505, address: "ตลาดนัดจตุจักร แขวงจตุจักร เขตจตุจักร กรุงเทพฯ" };

  $("#pickupInput").value = siam.address;
  $("#dropoffInput").value = chatuchak.address;

  state.pickupLocation = siam;
  state.dropoffLocation = chatuchak;
  state.distanceKm = 8.5;

  $("#pinStatusText").innerHTML = '🎯 <strong>เปิดโหมดจำลอง:</strong> สยามพารากอน → จตุจักร (8.5 กม.)';
  updatePricingDisplay();
  showToast("จำลองปักหมุดสำเร็จ! ระยะทาง 8.5 กม.");
}

/* ============================================================================
 * 4. PRICING SYSTEM: ระบบคำนวณราคา Real-time
 * ============================================================================
 * สูตรคำนวณ:
 * ราคารวม = ราคาตามขนาดพัสดุ (S/M/L) + (ระยะทาง กม. × ราคาต่อกิโลเมตร)
 * ============================================================================ */

function calculatePricing() {
  const size = state.selectedSize || "M";
  const basePrice = PRICING.base[size] || 50;
  const ratePerKm = PRICING.perKm || 8;
  const distance = Math.max(0, state.distanceKm || 0);

  // คำนวณค่าระยะทาง
  const distanceCost = Math.round(distance * ratePerKm);
  // ยอดรวมทั้งหมด
  const totalPrice = basePrice + distanceCost;

  return {
    size,
    basePrice,
    ratePerKm,
    distance,
    distanceCost,
    totalPrice
  };
}

/**
 * อัปเดตตัวเลขในแถบสรุปราคาใต้การ์ด
 */
function updatePricingDisplay() {
  const p = calculatePricing();

  // ข้อมูลขนาด
  $("#sumSizeName").textContent = `ขนาด ${p.size}`;
  $("#sumSizePrice").textContent = `${p.basePrice} บาท`;
  $("#sumSizeDesc").textContent = SIZE_DESCRIPTIONS[p.size] || "";

  // ข้อมูลระยะทาง
  $("#sumDistanceText").textContent = `${p.distance.toFixed(1)} กม.`;
  $("#sumDistancePrice").textContent = `${p.distanceCost} บาท`;

  // ยอดรวมตัวเลขใหญ่
  $("#sumTotalPrice").textContent = p.totalPrice.toLocaleString("th-TH");
}

/**
 * สลับการเลือกขนาดพัสดุ (S, M, L)
 */
function handleSizeSelect(button) {
  const size = button.dataset.size;
  if (!size) return;

  state.selectedSize = size;

  // อัปเดตคลาส active บนปุ่มทั้งหมด
  $$(".size-btn").forEach((btn) => {
    const isTarget = btn === button;
    btn.classList.toggle("active", isTarget);
    btn.setAttribute("aria-checked", isTarget);
  });

  // คำนวณราคาใหม่ทันที
  updatePricingDisplay();
}

/* ============================================================================
 * 5. ORDER FORM & VALIDATION: ตรวจสอบข้อมูลและสั่งส่งพัสดุ
 * ============================================================================ */

/**
 * ล้างข้อมูลฟอร์มทั้งหมด (ปุ่มยกเลิก)
 */
function resetOrderForm() {
  if (confirm("คุณต้องการล้างข้อมูลในฟอร์มและหมุดทั้งหมดใช่หรือไม่?")) {
    clearMapPins();
    $("#recipientName").value = "";
    $("#recipientPhone").value = "";
    $("#orderFormAlert").hidden = true;

    // คืนค่าขนาดพัสดุเป็น M
    const defaultSizeBtn = $('.size-btn[data-size="M"]');
    if (defaultSizeBtn) handleSizeSelect(defaultSizeBtn);

    showToast("ล้างข้อมูลฟอร์มเรียบร้อยแล้ว");
  }
}

/**
 * ตรวจสอบและยืนยันการสั่งส่งพัสดุ
 */
function confirmOrder() {
  const alertEl = $("#orderFormAlert");
  alertEl.hidden = true;
  alertEl.textContent = "";

  // 1. ตรวจสอบว่าผู้ใช้ล็อกอินหรือยัง
  if (!state.currentUser) {
    alertEl.textContent = "กรุณาเข้าสู่ระบบก่อนทำการยืนยันการสั่งส่งพัสดุ";
    alertEl.hidden = false;
    openAuthModal("login", "กรุณาเข้าสู่ระบบก่อนทำการสั่งส่งพัสดุ");
    return;
  }

  // 2. ตรวจสอบข้อมูลจุดรับและจุดส่ง
  const pickupAddress = $("#pickupInput").value.trim();
  const dropoffAddress = $("#dropoffInput").value.trim();

  if (!pickupAddress) {
    alertEl.textContent = "กรุณาระบุจุดรับของ (พิมพ์ค้นหาหรือคลิกปักหมุดบนแผนที่)";
    alertEl.hidden = false;
    $("#pickupInput").focus();
    return;
  }

  if (!dropoffAddress) {
    alertEl.textContent = "กรุณาระบุจุดส่งของ (พิมพ์ค้นหาหรือคลิกปักหมุดบนแผนที่)";
    alertEl.hidden = false;
    $("#dropoffInput").focus();
    return;
  }

  // 3. ตรวจสอบข้อมูลผู้รับ
  const recipientName = $("#recipientName").value.trim();
  const recipientPhone = $("#recipientPhone").value.trim();

  if (!recipientName) {
    alertEl.textContent = "กรุณาระบุชื่อผู้รับพัสดุ";
    alertEl.hidden = false;
    $("#recipientName").focus();
    return;
  }

  const phoneRegex = /^0[0-9]{8,9}$/;
  if (!recipientPhone || !phoneRegex.test(recipientPhone.replace(/[-\s]/g, ""))) {
    alertEl.textContent = "กรุณาระบุเบอร์โทรศัพท์ผู้รับให้ถูกต้อง (เช่น 0812345678)";
    alertEl.hidden = false;
    $("#recipientPhone").focus();
    return;
  }

  // 4. ตรวจสอบระยะทางและการปักหมุด
  if (state.distanceKm <= 0) {
    // ถ้าผู้ใช้กรอกที่อยู่แต่ยังไม่ได้ปักหมุดเพื่อคำนวณระยะทาง
    alertEl.textContent = "กรุณาปักหมุดจุดรับและจุดส่งบนแผนที่ หรือคลิก 'จำลองปักหมุด' เพื่อคำนวณระยะทางจริง";
    alertEl.hidden = false;
    return;
  }

  // คำนวณราคาสุดท้าย
  const pricing = calculatePricing();

  // สร้าง Object คำสั่งซื้อ (Order Data)
  const orderId = `ORD-${Date.now().toString().slice(-6)}`;
  const orderData = {
    orderId: orderId,
    createdAt: new Date().toISOString(),
    customer: {
      name: state.currentUser.name,
      email: state.currentUser.email
    },
    recipient: {
      name: recipientName,
      phone: recipientPhone
    },
    route: {
      pickup: {
        address: pickupAddress,
        coordinates: state.pickupLocation ? { lat: state.pickupLocation.lat, lng: state.pickupLocation.lng } : null
      },
      dropoff: {
        address: dropoffAddress,
        coordinates: state.dropoffLocation ? { lat: state.dropoffLocation.lat, lng: state.dropoffLocation.lng } : null
      },
      distanceKm: pricing.distance
    },
    parcel: {
      size: pricing.size,
      description: SIZE_DESCRIPTIONS[pricing.size]
    },
    pricing: {
      basePrice: pricing.basePrice,
      distanceCost: pricing.distanceCost,
      ratePerKm: pricing.ratePerKm,
      totalPrice: pricing.totalPrice,
      currency: "THB"
    }
  };

  /**
   * ----------------------------------------------------------------------------
   * 📦 แสดงข้อมูลคำสั่งซื้อใน Console
   * 💡 จุดนี้คือจุดที่ใช้ fetch() ส่งข้อมูล orderData ไปยัง Backend API จริง:
   * ----------------------------------------------------------------------------
   * 
   * try {
   *   const response = await fetch("https://your-api.com/api/orders", {
   *     method: "POST",
   *     headers: {
   *       "Content-Type": "application/json",
   *       "Authorization": "Bearer " + userToken
   *     },
   *     body: JSON.stringify(orderData)
   *   });
   *   const resData = await response.json();
   *   console.log("บันทึกออเดอร์ลงฐานข้อมูลสำเร็จ:", resData);
   * } catch (err) {
   *   console.error("ส่งออเดอร์ไม่สำเร็จ:", err);
   * }
   * ----------------------------------------------------------------------------
   */
  console.log("📦 ================= [ORDER PLACED] =================");
  console.log("ข้อมูลคำสั่งส่งพัสดุ (พร้อมส่งไป API):", orderData);
  console.log("=====================================================");

  // แสดงหน้าต่างสรุปออเดอร์ (Summary Modal)
  showOrderSummaryModal(orderData);
}

/**
 * แสดง Modal สรุปออเดอร์
 */
function showOrderSummaryModal(order) {
  $("#summaryOrderIdText").textContent = `รหัสคำสั่งส่ง: #${order.orderId}`;
  $("#sumModalUserName").textContent = `${order.customer.name} (${order.customer.email})`;
  $("#sumModalRecipient").textContent = `${order.recipient.name} (โทร. ${order.recipient.phone})`;
  $("#sumModalPickup").textContent = order.route.pickup.address;
  $("#sumModalDropoff").textContent = order.route.dropoff.address;
  $("#sumModalSize").textContent = `ขนาด ${order.parcel.size} - ${order.parcel.description} (฿${order.pricing.basePrice})`;
  $("#sumModalDistance").textContent = `${order.route.distanceKm.toFixed(1)} กม. (ค่าระยะทาง ฿${order.pricing.distanceCost})`;
  $("#sumModalTotal").textContent = `฿${order.pricing.totalPrice.toLocaleString("th-TH")}`;

  $("#orderSummaryModal").removeAttribute("hidden");
}

function closeOrderSummaryModal() {
  $("#orderSummaryModal").setAttribute("hidden", "true");
}

/* ============================================================================
 * 6. VIDEO & ACCESSIBILITY: จัดการวิดีโอพื้นหลังและตัวช่วยต่างๆ
 * ============================================================================ */

function setupBackgroundVideo() {
  const video = $("#bgVideo");
  if (!video) return;

  // ตรวจจับข้อผิดพลาดในการโหลดวิดีโอ (ถ้าไม่มีไฟล์ bg.mp4)
  video.addEventListener("error", () => {
    console.info("ไม่พบไฟล์วิดีโอ หรือเกิดข้อผิดพลาดในการเล่น แสดงพื้นหลังไล่สีแทน");
    video.style.display = "none";
  });

  // ตรวจสอบ prefers-reduced-motion ของผู้ใช้
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  function handleMotionPreference(e) {
    if (e.matches) {
      video.removeAttribute("autoplay");
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }
  motionQuery.addEventListener("change", handleMotionPreference);
  handleMotionPreference(motionQuery);
}

/**
 * แสดง Toast แจ้งเตือนสั้นๆ มุมขวาล่าง
 */
let toastTimeout = null;
function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

/* ============================================================================
 * การผูก Event Listeners และเริ่มต้นระบบ (Bootstrap)
 * ============================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  // 1. จัดการวิดีโอ
  setupBackgroundVideo();

  // 2. โหลดสถานะการเข้าสู่ระบบ
  updateAuthUI();

  // 3. กำหนดค่าปุ่มเลือกขนาดพัสดุ (S, M, L)
  $$(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleSizeSelect(btn));
  });

  // 4. ผูกปุ่มการทำงานต่างๆ บนแผนที่
  $("#clearPinsBtn").addEventListener("click", clearMapPins);
  $("#pickupLocateBtn").addEventListener("click", useCurrentLocationForPickup);
  $("#btnDemoLocations").addEventListener("click", runDemoSimulation);

  // 5. ผูกปุ่มฟอร์มสั่งส่งของ
  $("#btnResetOrder").addEventListener("click", resetOrderForm);
  $("#btnConfirmOrder").addEventListener("click", confirmOrder);

  // 6. ผูก Modal สรุปออเดอร์
  $("#closeOrderSummaryBtn").addEventListener("click", closeOrderSummaryModal);
  $("#btnDismissOrderSummary").addEventListener("click", closeOrderSummaryModal);
  $("#btnCallDriver").addEventListener("click", () => {
    closeOrderSummaryModal();
    showToast("🎉 สั่งเรียกรถสำเร็จ! พนักงานขับรถกำลังเดินทางไปรับพัสดุ");
  });
  $("#orderSummaryModal").addEventListener("click", (e) => {
    if (e.target === $("#orderSummaryModal")) closeOrderSummaryModal();
  });

  // 7. ปุ่ม Esc เพื่อปิด Modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAuthModal();
      closeOrderSummaryModal();
    }
  });

  // 8. คำนวณราคาเริ่มต้น
  updatePricingDisplay();

  // 9. โหลด Google Maps JavaScript API
  loadGoogleMapsScript();
});

// ส่งออกฟังก์ชันสำหรับการเรียกใช้จากภายนอกหรือ Google Maps Callback
window.initGoogleMap = initGoogleMap;
