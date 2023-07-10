import express from 'express';
import { PrismaClient } from '@prisma/client'
import admin from "firebase-admin";
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = express();

// prisma
const prisma = new PrismaClient();

// firebase auth
const firebase_app = initializeApp({
  credential: admin.credential.cert({
    projectId: "chromascape",
    privateKey: JSON.parse(process.env.FIREBASE_PRIVATE_KEY || ""),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  })
});
const defaultAuth = getAuth(firebase_app);


app.get("/api/hello", async (req, res) => {
  const { name = 'World' } = req.query

  const user = await defaultAuth.getUserByEmail("adrienpringle@gmail.com");

  const db_user = await prisma.user.upsert({
    where: {
      firebase_uid: user.uid,
    },
    update: {},
    create: {
      firebase_uid: user.uid,
    }
  });


  return res.json({
    message: `Hello ${name}, ${db_user.firebase_uid}, ${db_user.createdAt}!`,
  })
})

module.exports = app;
