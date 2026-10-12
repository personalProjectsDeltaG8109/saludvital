import app from "./app.js";
import environment from "./config/environment.js";

app.listen(environment.port, () => {
  console.log(`SaludVital server running at http://localhost:${environment.port}`);
});
