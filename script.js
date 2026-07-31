const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwh4kBofGBfD2ue_xDPeWwpk9d4WThWq6xx1NYQas2unkyyLanOaXBupZjdXbHnca1x/exec";
const ESP32_URL = "http://10.238.9.240";

// ============================================
// เปิดกลอน ESP32
// ============================================
async function openDoor() {
  console.log("กำลังเรียก:", `${ESP32_URL}/open`);
  try {
    const res = await fetch(`${ESP32_URL}/open`, { method: "GET" });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
    return text.includes("ok");
  } catch (err) {
    console.error("ESP32 Error:", err);
    return false;
  }
}

function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("deviceId", id);
  }
  return id;
}

function goToScreen(screenId, step) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
  document.querySelectorAll(".dot").forEach((dot, i) => {
    dot.classList.toggle("done", i < step);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const rememberedEmail = localStorage.getItem("rememberedEmail");
  const rememberedUntil = localStorage.getItem("rememberedUntil");
  getDeviceId();

  if (rememberedEmail && rememberedUntil && Date.now() < parseInt(rememberedUntil)) {
    document.getElementById("reg-email").value = rememberedEmail;
  }
});

// OTP inputs
document.querySelectorAll("#otp-inputs input").forEach((input, i, inputs) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/, "");
    if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && i > 0) inputs[i - 1].focus();
  });
});

// ============================================
// STEP 1: ลงทะเบียน
// ============================================
document.getElementById("btn-register").addEventListener("click", async () => {
  const email     = document.getElementById("reg-email").value.trim();
  const name      = document.getElementById("reg-name").value.trim();
  const studentId = document.getElementById("reg-id").value.trim();
  const room      = document.getElementById("reg-room").value.trim();
  const deviceId  = getDeviceId();
  const errEl     = document.getElementById("register-error");

  errEl.textContent = "";

  if (!email || !name || !studentId || !room) {
    errEl.textContent = "กรุณากรอกข้อมูลให้ครบทุกช่อง";
    return;
  }

  const rememberedEmail  = localStorage.getItem("rememberedEmail");
  const rememberedUntil  = localStorage.getItem("rememberedUntil");
  const rememberedDevice = localStorage.getItem("deviceId");

  if (
    rememberedEmail === email &&
    rememberedUntil && Date.now() < parseInt(rememberedUntil) &&
    rememberedDevice === deviceId
  ) {
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "saveDirectly", email, name, studentId, room, deviceId })
      });
    } catch (e) {
      console.log("saveDirectly error:", e);
    }

    // เปิดกลอนทันทีสำหรับอุปกรณ์ที่จำไว้แล้ว
    await openDoor();

    document.getElementById("device-remembered").style.display = "flex";
    goToScreen("screen-success", 3);
    return;
  }

  const btn = document.getElementById("btn-register");
  btn.disabled = true;
  btn.textContent = "กำลังส่ง...";

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "register", email, name, studentId, room, deviceId })
    });
    const data = await res.json();
    console.log("register =", data);

    if (data.success) {
      localStorage.setItem("pendingStudentId", studentId);
      document.getElementById("otp-email-target").textContent = email;
      goToScreen("screen-otp", 2);
    } else {
      errEl.textContent = "❌ " + data.message;
    }
  } catch (err) {
    errEl.textContent = "❌ เกิดข้อผิดพลาด กรุณาลองใหม่";
  } finally {
    btn.disabled = false;
    btn.textContent = "ลงทะเบียน";
  }
});

// ============================================
// STEP 2: ยืนยัน OTP
// ============================================
document.getElementById("btn-verify").addEventListener("click", async () => {
  const inputs    = document.querySelectorAll("#otp-inputs input");
  const otp       = [...inputs].map(i => i.value).join("");
  const studentId = localStorage.getItem("pendingStudentId");
  const errEl     = document.getElementById("otp-error");

  errEl.textContent = "";

  if (otp.length < 6) {
    errEl.textContent = "กรุณากรอก OTP ให้ครบ 6 หลัก";
    return;
  }

  const btn = document.getElementById("btn-verify");
  btn.disabled = true;
  btn.textContent = "กำลังตรวจสอบ...";

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "verifyOTP", studentId, otp })
    });
    const data = await res.json();
    console.log("verifyOTP =", data);

    if (data.success) {
      // ✅ เรียก openDoor() จริงๆ
      const opened = await openDoor();
      if (!opened) {
        console.warn("เปิดกลอนไม่สำเร็จ แต่ OTP ผ่านแล้ว");
      }

      const remember = document.getElementById("remember-device").checked;
      if (remember) {
        const email = document.getElementById("reg-email").value.trim();
        localStorage.setItem("rememberedEmail", email);
        localStorage.setItem("rememberedUntil", Date.now() + 30 * 24 * 60 * 60 * 1000);
        document.getElementById("device-remembered").style.display = "flex";
      } else {
        document.getElementById("device-remembered").style.display = "none";
      }

      localStorage.removeItem("pendingStudentId");
      goToScreen("screen-success", 3);
    } else {
      errEl.textContent = "❌ " + data.message;
    }
  } catch (err) {
    errEl.textContent = "❌ เกิดข้อผิดพลาด กรุณาลองใหม่";
  } finally {
    btn.disabled = false;
    btn.textContent = "ยืนยัน";
  }
});

// ส่ง OTP อีกครั้ง
document.getElementById("btn-resend").addEventListener("click", async (e) => {
  e.preventDefault();
  goToScreen("screen-register", 1);
  document.getElementById("otp-error").textContent = "";
});

document.getElementById("btn-continue").addEventListener("click", () => {
  document.getElementById("reg-email").value = "";
  document.getElementById("reg-name").value = "";
  document.getElementById("reg-id").value = "";
  document.getElementById("reg-room").value = "";
  document.getElementById("register-error").textContent = "";
  document.getElementById("otp-error").textContent = "";
  document.querySelectorAll("#otp-inputs input").forEach(i => i.value = "");
  goToScreen("screen-register", 1);
});
