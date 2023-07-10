import express, { Request, Response, NextFunction } from 'express';
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

enum Role {
  User,
  Device
}
interface Context {
  uid?: string
  id?: BigInt
}

declare global {
  namespace Express {
    interface Request {
      context: Context
    }
  }
}

async function getFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  const auth_header = req.headers.authorization;

  if (auth_header) {
    try {
      const decoded_token = await defaultAuth.verifyIdToken(auth_header);
      req.context.uid = decoded_token.uid;
      return next();
    } catch (e) { }
  }

  const err = new Error('Not authorized!');
  res.status(401);
  return next(err);
}

async function authorizeUser(req: Request, res: Response, next: NextFunction) {
  const uid = req.context.uid
  if (uid) {
    try {

      let potential_user = await prisma.user.findUniqueOrThrow({
        where: {
          firebase_uid: uid
        }
      })

      req.context.uid = uid;
      req.context.id = potential_user.id;
      return next();

    } catch (e) { }
  }

  const err = new Error('Not authorized!');
  res.status(401);
  return next(err);
}


async function authorizeDevice(req: Request, res: Response, next: NextFunction) {
  const uid = req.context.uid
  if (uid) {
    try {

      let potential_device = await prisma.device.findUniqueOrThrow({
        where: {
          firebase_uid: uid
        }
      })

      req.context.uid = uid;
      req.context.id = potential_device.id;
      return next();

    } catch (e) { }
  }

  const err = new Error('Not authorized!');
  res.status(401);
  return next(err);
}

// user apis (todo)
app.get("/api/user", getFirebaseAuth, authorizeUser, async (req, res) => { });
app.patch("/api/user", getFirebaseAuth, authorizeUser, async (req, res) => { });
app.post("/api/user/device", getFirebaseAuth, authorizeUser, async (req, res) => { });
app.delete("/api/user/device", getFirebaseAuth, authorizeUser, async (req, res) => { });
app.post("/api/user/pattern", getFirebaseAuth, authorizeUser, async (req, res) => { });
app.delete("/api/user/pattern", getFirebaseAuth, authorizeUser, async (req, res) => { });
app.post("/api/user/pattern_schedule", getFirebaseAuth, authorizeUser, async (req, res) => { });
app.delete("/api/user/pattern_schedule", getFirebaseAuth, authorizeUser, async (req, res) => { });


// device apis (todo)
app.get("/api/device", getFirebaseAuth, authorizeDevice, async (req, res) => { });
app.post("/api/device/user", getFirebaseAuth, authorizeDevice, async (req, res) => { });
app.delete("/api/device/user", getFirebaseAuth, authorizeDevice, async (req, res) => { });


// global apis
app.post("/api/user", getFirebaseAuth, async (req, res, next) => {
  const uid = req.context.uid;
  if (!uid) {
    const err = new Error('No uid found??');
    res.status(500);
    return next(err);
  }

  const new_user = await prisma.user.create({
    data: {
      firebase_uid: uid
    }
  });

  return res.json(new_user);
});

app.get("/api/pattern/:pattern_id", async (req, res, next) => {
  try {
    const id = BigInt(req.params.pattern_id);

    let pattern = await prisma.pattern.findUnique({
      where: {
        id: id
      }
    });

    return res.json(pattern);
  } catch (e) {
    return next(e)
  }

});

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
});

module.exports = app;
