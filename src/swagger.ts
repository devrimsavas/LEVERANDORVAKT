import swaggerAutogen from "swagger-autogen";
import path from "node:path";

const doc = {
  info: {
    title: "Leverandørvakt API",
    description:
      "Early-warning service for Norwegian businesses, built on Brønnøysund Register Centre data.",
    version: "1.0.0",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "Auth", description: "Registration, login and the current user" },
    {
      name: "Companies",
      description: "Company lookup and search in the Brønnøysund Register",
    },
    {
      name: "Watchlist",
      description: "Companies followed by the logged-in user",
    },
    {
      name: "Notifications",
      description: "Changes in followed companies, per user",
    },
    {
      name: "Assistant",
      description:
        "Questions in plain language about companies and the user's watchlist, answered with tool calling",
    },
    {
      name: "Trends",
      description:
        "New companies registered over time, by municipality, industry and organization form",
    },
    { name: "Admin", description: "Admin-only operations" },
    { name: "General", description: "API status" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

const outputFile = path.join(process.cwd(), "swagger_output.json");
const endpointsFiles = ["./dist/app.js"];

swaggerAutogen({ openapi: "3.0.0" })(outputFile, endpointsFiles, doc);
