
import dotenv from "dotenv";

dotenv.config();

const environment = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 3000,
};

export default environment;
