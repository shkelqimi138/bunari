// Privacy, support and terms popups: they open and close through the address (#privacy, #support,
// #terms) with CSS alone. This script only moves keyboard focus into an open popup, returns it
// to the link that opened it, and lets Escape close it.
(() => {
  let opener = null;

  const openModal = () => document.querySelector('.modal:target');

  // Runs after the browser has finished handling the click, so the focus it sets is the one that stays.
  const syncFocus = () =>
    setTimeout(() => {
      const modal = openModal();
      if (modal) {
        const card = modal.querySelector('.modal-card');
        if (card) card.scrollTop = 0;
        modal.querySelector('h1')?.focus({ preventScroll: true });
      } else if (opener) {
        opener.focus({ preventScroll: true });
        opener = null;
      }
    });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link && link.hash.length > 1 && document.querySelector(`.modal#${CSS.escape(link.hash.slice(1))}`))
      opener = link;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openModal()) location.hash = 'close';
  });
  window.addEventListener('hashchange', syncFocus);
  syncFocus();
})();
