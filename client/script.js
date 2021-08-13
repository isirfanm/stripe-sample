const submit = async (e) => {
  e.preventDefault();

  const formData = Object.fromEntries(
    new FormData(document.getElementById("payment-form"))
  );

  const subResp = await fetch("/subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(formData)
  });
  const subJson = await subResp.json();

  window.location.href =
    "/instructions.html?src=" +
    encodeURIComponent(subJson.bank_instructions_url) +
    "&sub_id=" +
    subJson.sub_id;
};

document.getElementById("payment-form").addEventListener("submit", submit);
