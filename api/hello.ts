import type { VercelRequest, VercelResponse } from '@vercel/node'
import { PrismaClient } from '@prisma/client'
import admin from "firebase-admin";
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';


// prisma
const prisma = new PrismaClient()

// firebase auth
const app = initializeApp({
  credential: admin.credential.cert({
    projectId: "chromascape",
    privateKey: JSON.parse(process.env.FIREBASE_PRIVATE_KEY || ""),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  })
});
const defaultAuth = getAuth(app);


export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { name = 'World' } = req.query

  const user = await defaultAuth.getUserByEmail("adrienpringle@gmail.com");

  prisma.user.upsert({
    where: {
      firebase_uid: user.uid,
    },
    update: {},
    create: {
      firebase_uid: user.uid,
    }
  });

  return res.json({
    message: `Hello ${name}, ${user.uid}!`,
  })
}
