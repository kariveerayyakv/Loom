/* ================================================
   LOOM — Index Page JS
   ================================================ */

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === this) hideAdminLogin();
    });
  }

  // Keyboard close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideAdminLogin();
  });
});
