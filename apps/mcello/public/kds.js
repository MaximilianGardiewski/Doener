let orders = [
  { id: 184, state:"incoming", customer:"Max", time:"jetzt", items:["Drehspieß im Fladenbrot","Ayran"], total:"11,00 €" },
  { id: 191, state:"planned", customer:"Lia", time:"19:15", items:["Pizza Mcello","Apothekensaft"], total:"17,50 €" },
  { id: 180, state:"preparing", customer:"Timo", time:"18:35", items:["Drehspieß als Teller Spezial"], total:"12,50 €" },
];

const lanes = ["incoming","planned","preparing","ready"];
const target = Object.fromEntries(lanes.map((lane) => [lane, document.querySelector(`#${lane}`)]));

function actions(order) {
  if (order.state === "incoming") return `
    <div class="quick">
      <button data-action="accept" data-id="${order.id}" data-min="15">15 Min</button>
      <button data-action="accept" data-id="${order.id}" data-min="20">20 Min</button>
      <button data-action="accept" data-id="${order.id}" data-min="30">30 Min</button>
      <button data-action="reject" data-id="${order.id}">Ablehnen</button>
    </div>`;
  if (order.state === "planned") return `<div class="quick"><button data-action="activate" data-id="${order.id}">Jetzt aktivieren</button></div>`;
  if (order.state === "preparing") return `
    <div class="quick">
      <button data-action="ready" data-id="${order.id}">Fertig</button>
      <button data-action="delay" data-id="${order.id}">+10 Min</button>
    </div>`;
  return `<div class="quick"><button data-action="complete" data-id="${order.id}">Erledigt</button></div>`;
}

function render() {
  lanes.forEach((lane) => target[lane].innerHTML = "");
  orders.forEach((order) => {
    const el = document.createElement("article");
    el.className = `order ${order.state === "incoming" ? "alert" : ""}`;
    el.innerHTML = `
      <div class="order-head"><strong>#${order.id} · ${order.customer}</strong><small>${order.time}</small></div>
      <ul>${order.items.map((item) => `<li>${item}</li>`).join("")}</ul>
      <p><strong>${order.total}</strong></p>${actions(order)}`;
    target[order.state].appendChild(el);
  });
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => act(button)));
}

function act(button) {
  const order = orders.find((item) => item.id === Number(button.dataset.id));
  if (!order) return;
  switch(button.dataset.action) {
    case "accept":
      order.state = "preparing";
      order.time = `ca. ${button.dataset.min} Min`;
      break;
    case "activate":
      order.state = "preparing";
      order.time = "jetzt aktiv";
      break;
    case "ready":
      order.state = "ready";
      order.time = "abholbereit";
      break;
    case "complete":
      orders = orders.filter((item) => item !== order);
      break;
    case "delay":
      order.time = "+10 Min";
      break;
    case "reject":
      orders = orders.filter((item) => item !== order);
      break;
  }
  render();
}
document.querySelector("#rush").addEventListener("click", (e) => {
  e.currentTarget.textContent = e.currentTarget.textContent.includes("AKTIV") ? "Rush/Pause" : "Rush/Pause AKTIV";
});
render();
