const base64 = require("base-64");

const username = "YOUR-USERNAME";
const password = "YOUR-PASSWORD";
const consumerKey = "YOUR-CONSUMER-KEY";
const baseUrl = "YOUR-BASE-URL";

const credentials = `${username}:${password}`;
const basicAuth = base64.encode(credentials);

async function getToken() {
  try {
    const response = await fetch(`${baseUrl}/v1/hie-auth?key=${consumerKey}`, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log("JWT Token:", data.token);
    return data.token;
  } catch (error) {
    console.error("Error fetching token:", error);
  }
}

getToken();
