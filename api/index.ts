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
  id?: bigint
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

// user apis

// no settings so not useful yet
// app.patch("/api/user", getFirebaseAuth, authorizeUser, async (req, res) => { });

// for now, no handshake. let the device be the sole decider of who does what
// app.post("/api/user/device", getFirebaseAuth, authorizeUser, async (req, res) => { });

app.delete("/api/user/device", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const device_id = req.body.device_id as string | undefined;
  const user_id = req.context.id;

  if (!user_id || !device_id) {
    const err = new Error('no device id specified');
    res.status(400);
    return next(err);
  }

  try {
    const updated = await prisma.device.updateMany({
      where: {
        id: BigInt(device_id),
        userId: user_id,
      }, data: {
        userId: null
      }
    })

    if (updated.count == 0) {
      const err = new Error('unable to update device');
      res.status(400);
      return next(err);
    }

    return res.json("success: removed device user");

  } catch (e) {
    return next(e)
  }



});
app.post("/api/user/pattern", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const content = req.body.content as string | undefined;
  const user_id = req.context.id;

  if (!user_id) {
    const err = new Error('no uid found??');
    res.status(500);
    return next(err);
  }

  try {
    const new_pattern = await prisma.pattern.create({
      data: {
        userId: user_id,
        content
      }
    });


    return res.json(new_pattern);
  } catch (e) {
    return next(e);
  }
});

app.delete("/api/user/pattern", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const pattern_id = req.body.pattern_id as string | undefined;
  const user_id = req.context.id;

  if (!user_id || !pattern_id) {
    const err = new Error('no pattern id specified');
    res.status(400);
    return next(err);
  }

  try {
    const deleted = await prisma.pattern.deleteMany({
      where: {
        id: BigInt(pattern_id),
        userId: user_id
      }
    })

    if (deleted.count == 0) {
      const err = new Error('unable to delete pattern');
      res.status(400);
      return next(err);
    }

    return res.json("success: deleted pattern");

  } catch (e) {
    return next(e)
  }
});

app.post("/api/user/pattern_schedule", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const device_id = req.body.device_id as string | undefined;
  const pattern_id = req.body.pattern_id as string | undefined;
  const scheduled_time = req.body.scheduled_time as string | undefined;

  if (!device_id) {
    const err = new Error('no device id specified');
    res.status(400);
    return next(err);
  }

  if (!pattern_id) {
    const err = new Error('no pattern id specified');
    res.status(400);
    return next(err);
  }

  if (!scheduled_time) {
    const err = new Error('no scheduled time specified');
    res.status(400);
    return next(err);
  }

  const user_id = req.context.id;

  if (!user_id) {
    const err = new Error('no uid found??');
    res.status(500);
    return next(err);
  }

  try {
    //todo disallow scheduling for a device you don't own
    //todo validate scheduled time
    const new_scheduled_pattern = prisma.scheduledPattern.create({
      data: {
        deviceId: BigInt(device_id),
        patternId: BigInt(pattern_id),
        scheduledFor: scheduled_time,
      }
    });

    return res.json(new_scheduled_pattern);

  } catch (e) {
    return next(e)
  }
});
app.delete("/api/user/pattern_schedule", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const scheduled_pattern_id = req.body.scheduled_pattern_id as string | undefined;
  const user_id = req.context.id;

  if (!user_id || !scheduled_pattern_id) {
    const err = new Error('no scheduled pattern id specified');
    res.status(400);
    return next(err);
  }

  try {
    //todo disbale deleteing for devices u dont own
    const deleted = await prisma.scheduledPattern.delete({
      where: {
        id: BigInt(scheduled_pattern_id),
      }
    });

    return res.json("success: deleted pattern");


  } catch (e) {
    return next(e)
  }

});


// device apis
app.post("/api/device/user", getFirebaseAuth, authorizeDevice, async (req, res, next) => {
  const user_id = req.body.user_id as string | undefined;
  const device_id = req.context.id;

  if (!user_id || !device_id) {
    const err = new Error('no user id specified');
    res.status(400);
    return next(err);
  }

  try {
    const updated = await prisma.device.updateMany({
      where: {
        id: device_id,
        userId: null,
      }, data: {
        userId: BigInt(user_id)
      }
    })

    if (updated.count == 0) {
      const err = new Error('unable to update device');
      res.status(400);
      return next(err);
    }

    return res.json("success: updated device user");

  } catch (e) {
    return next(e)
  }
});


// global apis
app.get("/api/user", getFirebaseAuth, async (req, res, next) => {

  const uid = req.context.uid;
  if (!uid) {
    const err = new Error('No uid found??');
    res.status(500);
    return next(err);
  }

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        firebase_uid: uid
      }
    });
    return res.json(user);
  } catch (e) {
    next(e)
  }
});

app.get("/api/device", getFirebaseAuth, async (req, res, next) => {
  const uid = req.context.uid;
  if (!uid) {
    const err = new Error('No uid found??');
    res.status(500);
    return next(err);
  }

  try {
    const device = await prisma.device.findUniqueOrThrow({
      where: {
        firebase_uid: uid
      }
    });
    return res.json(device);
  } catch (e) {
    next(e)
  }
});


app.post("/api/user", getFirebaseAuth, async (req, res, next) => {
  const uid = req.context.uid;
  if (!uid) {
    const err = new Error('No uid found??');
    res.status(500);
    return next(err);
  }

  try {
    const new_user = await prisma.user.create({
      data: {
        firebase_uid: uid
      }
    });

    return res.json(new_user);
  } catch (e) {
    next(e)
  }
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
