import type { Request, Response } from "express";

export const signin = (req: Request, res: Response) => {
    res.send("works")
};
