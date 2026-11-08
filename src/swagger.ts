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
};

const outputFile = path.join(process.cwd(), "swagger_output.json");
const endpointsFiles = [path.join(process.cwd(), "dist", "app.js")];

swaggerAutogen({ openapi: "3.0.0" })(outputFile, endpointsFiles, doc);
