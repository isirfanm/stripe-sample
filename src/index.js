const express = require("express");
const app = express();
const path = require("path");

// Copy the .env.example in the root into a .env file in this folder
const envFilePath = path.resolve(__dirname, "../.env");
const env = require("dotenv").config({ path: envFilePath });
if (env.error) {
  throw new Error(
    `Unable to load the .env file from ${envFilePath}. Please copy .env.example to ${envFilePath}`
  );
}

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.static(process.env.STATIC_DIR));

app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    }
  })
);

app.get("/", (req, res) => {
  const path = resolve(process.env.STATIC_DIR + "/index.html");
  res.sendFile(path);
});

app.post("/subscription", async (req, res) => {
  const { name, email, bank } = req.body;

  const customer = await stripe.customers.create({
    name,
    email
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [
      {
        price: "price_1IlcFMIpy8Je3Ch07urc2Ed4"
      }
    ],
    collection_method: "send_invoice",
    days_until_due: 30,
    payment_behavior: "allow_incomplete"
  });

  const invoice = await stripe.invoices.finalizeInvoice(
    subscription.latest_invoice,
    {
      expand: ["payment_intent"]
    }
  );

  let paymentIntent = await stripe.paymentIntents.update(
    invoice.payment_intent.id,
    {
      payment_method_data: {
        type: "id_bank_transfer",
        billing_details: {
          email: email,
          name: name
        },
        id_bank_transfer: {
          bank: bank
        }
      }
    }
  );

  paymentIntent = await stripe.paymentIntents.confirm(
    invoice.payment_intent.id
  );

  console.log(
    paymentIntent.next_action.display_bank_transfer_instructions
      .financial_addresses[0]
  );

  res.send({
    sub_id: subscription.id,
    bank_instructions_url:
      paymentIntent.next_action.display_bank_transfer_instructions
        .financial_addresses[0].id_bban.hosted_instructions_url
  });
});

app.get("/subscription/:sub_id", async (req, res) => {
  const { sub_id } = req.params;

  const sub = await stripe.subscriptions.retrieve(sub_id, {
    expand: ["latest_invoice", "latest_invoice.payment_intent"]
  });

  console.log(sub);

  res.send(sub);
});

// Webhook handler for asynchronous events.
app.post("/webhook", async (req, res) => {
  let eventType;
  let data;

  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers["stripe-signature"];

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    // Extract the object from the event.
    data = event.data;
    eventType = event.type;

    console.log("WEBHOOK RECEIVED");
    console.log(eventType);

    //console.log(data);
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "checkout.session.completed") {
    console.log(`🔔  Payment received!`);
  }

  res.sendStatus(200);
});

app.listen(8080, () => console.log(`Node server listening on port 8080!`));
