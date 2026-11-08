//app.ts
import "dotenv/config";
import express from "express";
const PORT = process.env.PORT || 3000;
//path
import path from "node:path";

//routes
import indexPage from "./routes/index.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//public
app.use(express.static(path.join(import.meta.dirname, "public")));

//routes 
app.use("/",indexPage)



const mainApp=async()=> {
    try {
        //listen port 
        app.listen(PORT, async () => {
        console.log(`listening at ${PORT}`);
        }); 
    } catch(error:any) {
        console.log(`Error ${error.message}`);
        process.exit(1)
    }
}

mainApp();
