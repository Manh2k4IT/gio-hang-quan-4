async function restoreAdminLogin() {
  try {
    const response = await fetch("/admin/auth/session");
    if (!response.ok) throw new Error("Không thể kiểm tra phiên đăng nhập");
    const session = await response.json();
    if (session.authenticated) window.location.replace("/admin.html");
  } catch (error) {
    console.error("Không thể kiểm tra đăng nhập:", error);
    const errorElement = document.getElementById("login-error");
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  }
}
restoreAdminLogin();

document.getElementById("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("login-submit");
  const errorElement = document.getElementById("login-error");
  button.disabled = true;
  errorElement.hidden = true;
  try {
    const response = await fetch("/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Request": "1" },
      body: JSON.stringify({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Không thể đăng nhập");
    window.location.replace("/admin.html");
  } catch (error) {
    console.error("Không thể đăng nhập quản trị:", error);
    errorElement.textContent = error.message || "Không thể kết nối máy chủ";
    errorElement.hidden = false;
  } finally {
    button.disabled = false;
  }
});
