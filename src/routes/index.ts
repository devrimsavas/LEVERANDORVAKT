//index.ts 
import express from 'express';
import type {Request,Response} from 'express';

const router=express.Router();

//index main 
router.get("/",(req:Request,res:Response)=> {
    res.json({
        message:"App Index Page"
    })
})

export default router;
