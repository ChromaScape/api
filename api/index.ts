import express, { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client'
import admin from "firebase-admin";
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

//lmfao dont mind this abomination
(BigInt.prototype as any).toJSON = function() { return this.toString() }


const app = express();
app.use(express.json())


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
      if(!req.context){req.context = {}}
      req.context.uid = decoded_token.uid;
      return next();
    } catch (e) { 

      //todo remove in prod
      console.error(e);
    }
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

      if(!req.context){req.context = {}}
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

/**
 * @api {get} /user/devices View all paired devices
 * @apiGroup User
 *
 * @apiSuccess {bigint} id
 * @apiSuccess {String} firebase_uid
 * @apiSuccess {bigint} userId?
 * @apiSuccess {bigint} patternId?
 * @apiSuccess {String} lightLayout?
 * @apiSuccess {Date} createdAt
*/
app.get("/api/user/devices", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const user_id = req.context.id;

  if (!user_id) {
    const err = new Error('no user id somehow');
    res.status(400);
    return next(err);
  }

  try {
    const devices = await prisma.device.findMany({
      where: {
        userId: user_id
      }
    })


    return res.json(devices);

  } catch (e) {
    return next(e)
  }
});

/**
 * @api {post} /user/device_pattern Set device pattern
 * @apiGroup User
 *
 * @apiBody {bigint} device_id device id
 * @apiBody {bigint} pattern_id pattern id
*/
app.post("/api/user/device_pattern", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const user_id = req.context.id;
  const device_id = req.body.device_id as string | undefined;
  const pattern_id = req.body.pattern_id as string | undefined;


  if (!user_id) {
    const err = new Error('no user id somehow');
    res.status(400);
    return next(err);
  }

  if (!device_id || !pattern_id) {
    const err = new Error('body incorrect \n' + JSON.stringify(req.body));
    res.status(400);
    return next(err);
  }

  try {
    const devices = await prisma.device.updateMany({
      where: {
        userId: user_id,
        id: BigInt(device_id)
      },
      data: {
        patternId: BigInt(pattern_id)
      }
    })

    if (devices.count == 0){
      const err = new Error('no update');
      res.status(400);
      return next(err);
    }

    return res.json(devices);

  } catch (e) {
    return next(e)
  }
});
/**
 * @api {get} /user/remove_device Detach device from user
 * @apiGroup User
 *
 * @apiBody {bigint} device id to remove
 */
app.get("/api/user/remove_device", getFirebaseAuth, authorizeUser, async (req, res, next) => {
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
/**
 * @api {get} /user/patterns Get all user patterns
 * @apiGroup User
 * 
 * @apiSuccess {bigint} id
 * @apiSuccess {bigint} userId
 * @apiSuccess {string} content
 * @apiSuccess {Date} createdAt
 */
app.get("/api/user/patterns", getFirebaseAuth, authorizeUser, async (req, res, next) => {
  const user_id = req.context.id;

  if (!user_id) {
    const err = new Error('no uid found??');
    res.status(500);
    return next(err);
  }

  try {
    const patterns = await prisma.pattern.findMany({
      where: {
        userId: user_id
      }
    });


    return res.json(patterns);
  } catch (e) {
    return next(e);
  }
});
/**
 * @api {post} /user/pattern Create a new pattern
 * @apiGroup User
 *
 * @apiBody {String} content pattern binary data
 *
 * @apiSuccess {bigint} id
 * @apiSuccess {bigint} userId
 * @apiSuccess {string} content
 * @apiSuccess {Date} createdAt
 */
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

/**
 * @api {delete} /user/pattern Delete an existing pattern
 * @apiGroup User
 *
 * @apiBody {BigInt} pattern_id
 */
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

/**
 * @api {post} /user/pattern_schedule Create a new pattern
 * @apiGroup User
 *
 * @apiBody {bigint} device_id
 * @apiBody {bigint} pattern_id
 * @apiBody {Date} scheduled_time
 * 
 * @apiSuccess {bigint} id
 * @apiSuccess {bigint} deviceId
 * @apiSuccess {bigint} patternId
 * @apiSuccess {Date} scheduledFor
 * @apiSuccess {Date} createdAt
 */
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

/**
 * @api {delete} /user/pattern_schedule Delete an existing scheduled pattern
 * @apiGroup User
 *
 * @apiBody {BigInt} sheduled_pattern_id
 */
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

/**
 * @api {patch} /device/user Pair device with a user
 * @apiGroup Device
 *
 * @apiBody {bigint} user_id
 */
app.patch("/api/device/user", getFirebaseAuth, authorizeDevice, async (req, res, next) => {
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

/**
 * @api {get} /user Get currently logged in user
 * @apiGroup User
 * 
 * @apiSuccess {bigint} id
 * @apiSuccess {String} firebase_uid
 * @apiSuccess {Date} createdAt
 */
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

/**
 * @api {get} /device Get currently logged in device
 * @apiGroup Device
 * 
 * @apiSuccess {bigint} id
 * @apiSuccess {String} firebase_uid
 * @apiSuccess {bigint} userId?
 * @apiSuccess {bigint} patternId?
 * @apiSuccess {String} lightLayout?
 * @apiSuccess {Date} createdAt
 */
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

/**
 * @api {post} /user Create a new user
 * @apiGroup User
 * 
 * @apiSuccess {bigint} id
 * @apiSuccess {String} firebase_uid
 * @apiSuccess {Date} createdAt
 */
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


/**
 * @api {post} /device Create a new device
 * @apiGroup Device
 * 
 * @apiSuccess {bigint} id
 * @apiSuccess {String} firebase_uid
 * @apiSuccess {Date} createdAt
 */
app.post("/api/device", getFirebaseAuth, async (req, res, next) => {
  const uid = req.context.uid;
  if (!uid) {
    const err = new Error('No uid found??');
    res.status(500);
    return next(err);
  }

  try {
    const new_device = await prisma.device.create({
      data: {
        firebase_uid: uid
      }
    });

    return res.json(new_device);
  } catch (e) {
    next(e)
  }
});


/**
 * @api {get} /user/pattern/:pattern_id Get a pattern by id
 * @apiGroup Global
 * 
 * @apiParam {bigint} pattern_id pattern binary data
 *
 * @apiSuccess {bigint} id
 * @apiSuccess {bigint} userId
 * @apiSuccess {string} content
 * @apiSuccess {Date} createdAt
 */
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


/**
 *  {get} /hello helloworld example to get started
 */
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

// // add to run locally
// app.listen(8080, () => {
//   console.log(`Example app listening on port ${8080}`)
// })