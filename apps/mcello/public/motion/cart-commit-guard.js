const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function cartCommitSucceededAfterClick() {
  const drawer = document.querySelector("#cartDrawer");
  return Boolean(drawer?.classList.contains("open") && !document.querySelector("#productModal.open"));
}

function clearRejectedCartFlight() {
  for (const ghost of document.querySelectorAll(".motion-cart-flight-ghost")) ghost.remove();
}

function runFallbackCartConfirmation(sticky) {
  if (!sticky) return;
  sticky.dataset.motionCart = "added";
  sticky.classList.remove("motion-cart-confirm");
  requestAnimationFrame(() => sticky.classList.add("motion-cart-confirm"));
  window.setTimeout(() => {
    sticky.classList.remove("motion-cart-confirm");
    delete sticky.dataset.motionCart;
  }, 460);
}

document.body.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const addToCart = target?.closest("#addToCart");
  if (!addToCart || addToCart.matches(":disabled")) return;

  // app.js owns the click at the target. At body-bubble time its synchronous
  // result is already visible, while motion.js's document-bubble acknowledgement
  // has not run yet. Stop only this add-to-cart event from reaching that legacy
  // acknowledgement and publish feedback from the committed postconditions.
  event.stopPropagation();

  if (!cartCommitSucceededAfterClick()) {
    clearRejectedCartFlight();
    return;
  }

  if (reducedMotion.matches) return;
  const sticky = document.querySelector(".sticky-order");
  if (document.documentElement.dataset.mcelloMotionEngine === "ready") {
    document.dispatchEvent(new CustomEvent("mcello:cart-committed", { detail: { sticky } }));
    return;
  }

  runFallbackCartConfirmation(sticky);
});
