const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const app = express();
const https = require("https");
const fs = require("fs");

app.use(cors());
app.use(express.json());

require("dotenv").config();

const secret = process.env.SECRET_KEY;
const mongoURL = process.env.MONGO_URL;

const certificatePath =
  "/etc/letsencrypt/live/api.horsera-backend.store/fullchain.pem";
const privateKeyPath =
  "/etc/letsencrypt/live/api.horsera-backend.store/privkey.pem";

const certificate = fs.readFileSync(certificatePath, "utf8");
const privateKey = fs.readFileSync(privateKeyPath, "utf8");

const credentials = { key: privateKey, cert: certificate };

const httpsServer = https.createServer(credentials, app);
const PORT = process.env.PORT || 3000;

const jwtAuthentication = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.sendStatus(401);
  }

  const token = authHeader.split(" ")[1];
  jwt.verify(token, secret, (err, user) => {
    if (err) {
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

const userSchema = mongoose.Schema({
  username: String,
  password: String,
  purchasedCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Courses" }],
  completedLessons: {
    type: Map,
    of: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lessons" }],
    default: {},
  },
});

const adminSchema = mongoose.Schema({
  username: String,
  password: String,
});

const courseSchema = mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  imageLink: String,
  published: Boolean,
  courseLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lessons" }],
});

const lessonSchema = mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Courses" },
  title: String,
  description: String,
  lessonLink: String,
});

const Users = mongoose.model("Users", userSchema);
const Admins = mongoose.model("Admins", adminSchema);
const Courses = mongoose.model("Courses", courseSchema);
const Lessons = mongoose.model("Lessons", lessonSchema);

mongoose.connect(mongoURL);

// Serve static files from the root domain
app.use(
  "/.well-known/pki-validation",
  express.static("/home/ubuntu/.well-known/pki-validation")
);

//ssl certificate
app.get(
  "/.well-known/pki-validation/44AC8EC013FFB86144FD20FFE7CA908A.txt",
  (req, res) => {
    const filePath =
      "/home/ubuntu/.well-known/pki-validation/44AC8EC013FFB86144FD20FFE7CA908A.txt";
    res.sendFile(filePath);
  }
);

// Admin routes
app.post("/admin/signup", async (req, res) => {
  // logic to sign up admin
  const { username, password } = req.body;
  const adminRegistered = await Admins.findOne({
    username,
  });
  if (adminRegistered) {
    res.status(403).send({ message: "Admin already exists" });
  } else {
    const adminObj = new Admins({ username, password });
    await adminObj.save();

    const token = jwt.sign({ username, role: "admin" }, secret, {
      expiresIn: "1h",
    });
    res.json({ message: "admin created successfully", token });
  }
});

app.post("/admin/login", async (req, res) => {
  // logic to log in admin
  const { username, password } = req.body;
  const adminRegistered = await Admins.findOne({ username, password });
  if (adminRegistered) {
    const token = jwt.sign({ username, role: "admin" }, secret, {
      expiresIn: "1h",
    });
    res.json({ message: "logged in successfully", token });
  } else {
    res.status(403).send({ message: "Invalid username or password" });
  }
});

app.get("/admin/me", jwtAuthentication, async (req, res) => {
  try {
    const { username } = req.user;
    const getAdmin = Admins.findOne({ username });
    if (getAdmin) {
      return res.json({
        username: req.user.username,
        role: req.user.role,
      });
    } else {
      return res.sendStatus(401);
    }
  } catch {
    (error) => {
      console.log(error);
      res.sendStatus(401);
    };
  }
});

app.post("/admin/courses", jwtAuthentication, async (req, res) => {
  // logic to create a course
  const course = new Courses(req.body);
  await course.save();
  res.json({ message: "course created successfully", courseId: course.id });
});

app.put("/admin/courses/:courseId", jwtAuthentication, async (req, res) => {
  // logic to edit a course
  const courseId = await Courses.findByIdAndUpdate(
    req.params.courseId,
    req.body,
    { new: true }
  );
  if (courseId) {
    res.json("Course updated successfully");
  } else {
    res.status(404).json({ message: "course not found" });
  }
});

app.post("/admin/courses/:courseId", jwtAuthentication, async (req, res) => {
  const course = await Courses.findById(req.params.courseId);
  if (course) {
    const lesson = new Lessons(req.body);
    await lesson.save();
    course.courseLessons.push(lesson);
    await course.save();
    return res.json("Lesson added successfully");
  } else {
    res.status(404).json({ message: "course not found" });
  }
});

app.put("/admin/lessons/:lessonId", jwtAuthentication, async (req, res) => {
  try {
    const lessonUpdated = await Lessons.findByIdAndUpdate(
      req.params.lessonId,
      req.body,
      { new: true }
    );
    if (lessonUpdated) {
      return res.json({ message: "lesson updated successfully" });
    }
    return res.status(404).json({ message: "lesson not found" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "internal server error" });
  }
});

app.get("/admin/courses/:courseId", jwtAuthentication, async (req, res) => {
  try {
    const course = await Courses.findById(req.params.courseId).populate(
      "courseLessons"
    );
    if (course) {
      return res.json({ course });
    } else {
      return res.status(404).json({ message: "Course not found" });
    }
  } catch (err) {
    console.error("Error while finding course:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// app.get("admin/coursepage/:courseId", async (req, res) => {
//   Courses.findById(req.params.courseId, function (err, course) {
//     if (err) {
//       console.log(err);
//       res.status(404).json({ message: "course not found" });
//     } else {
//       console.log("Result : ", course);
//       res.json({ course });
//     }
//   });
// });

app.get("/admin/browsecourses", jwtAuthentication, async (req, res) => {
  // logic to get all courses
  try {
    const courses = await Courses.find({}).populate("courseLessons");
    res.json({ courses });
  } catch (e) {
    console.log(e);
    res.sendStatus(404);
  }
});

app.delete("/admin/courses/:courseId", jwtAuthentication, async (req, res) => {
  const courseId = req.params.courseId;
  const { role } = req.user;

  try {
    if (role === "admin") {
      // Delete the course from the Courses collection
      const deletedCourse = await Courses.findByIdAndDelete(courseId);

      if (deletedCourse) {
        const usersWithCompletedLessons = await Users.find({
          [`completedLessons.${courseId}`]: { $exists: true },
        });

        // remove the reference to the course from any user's purchasedCourses array
        await Users.updateMany(
          { purchasedCourses: courseId },
          { $pull: { purchasedCourses: courseId } }
        );

        // delete all the associated lessons for the course
        await Lessons.deleteMany({ courseId: courseId });

        // For each user with completed lessons, remove the completed lessons related to the course being deleted
        for (const user of usersWithCompletedLessons) {
          await Users.findByIdAndUpdate(user._id, {
            $unset: { [`completedLessons.${courseId}`]: 1 },
          });
        }

        res.json({ message: "Course deleted successfully" });
      } else {
        res.status(404).json({ message: "Course not found" });
      }
    } else {
      return res.status(403).json({ message: "Access denied. Not an admin" });
    }
  } catch (error) {
    console.error("Error while deleting course:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/admin/lessons/:lessonId", jwtAuthentication, async (req, res) => {
  const lessonId = req.params.lessonId;
  const { role } = req.user;

  try {
    if (role === "admin") {
      // Delete the lesson from the Lessons collection
      const deletedLesson = await Lessons.findByIdAndDelete(lessonId);

      if (deletedLesson) {
        // Remove the reference to the lesson from the associated course's courseLessons array
        const courseId = deletedLesson.courseId;
        await Courses.findByIdAndUpdate(courseId, {
          $pull: { courseLessons: lessonId },
        });
        // Find all users who have completed the lesson being deleted
        const usersWithCompletedLesson = await Users.find({
          [`completedLessons.${lessonId}`]: { $exists: true },
        });
        // For each user with completed lesson, remove the completed lesson
        for (const user of usersWithCompletedLesson) {
          await Users.findByIdAndUpdate(user._id, {
            $unset: { [`completedLessons.${lessonId}`]: 1 },
          });
        }

        return res.json({ message: "Lesson deleted successfully" });
      } else {
        return res.status(404).json({ message: "Lesson not found" });
      }
    } else {
      return res.status(403).json({ message: "Access denied. Not an admin" });
    }
  } catch (error) {
    console.error("Error while deleting lesson:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//common routes
//find role
app.get("/role/me", jwtAuthentication, async (req, res) => {
  const { username, role } = req.user;
  if (username) {
    return res.json({ username, role });
  }
  res.sendStatus(404).json({ message: "no user or admin found" });
});
app.get("/browsecourses", jwtAuthentication, async (req, res) => {
  // logic to get all courses
  try {
    const courses = await Courses.find({});
    res.json({ courses });
  } catch (e) {
    console.log(e);
    res.sendStatus(404);
  }
});

// User routes
app.post("/users/signup", async (req, res) => {
  // logic to sign up user
  const { username, password } = req.body;
  const registeredUser = await Users.findOne({ username });

  if (registeredUser) {
    return res.status(403).json({ message: "user already signed up" });
  } else {
    const userObject = new Users({ username, password });
    await userObject.save();

    const token = jwt.sign({ username, role: "user" }, secret, {
      expiresIn: "1h",
    });
    res.json({ message: "User registered successfully", token });
  }
});

app.post("/users/login", async (req, res) => {
  // logic to log in user
  const { username, password } = req.body;
  const userFound = await Users.findOne({ username, password });

  if (userFound) {
    const token = jwt.sign({ username, role: "user" }, secret, {
      expiresIn: "1h",
    });
    res.json({ message: "logged in successfully", token });
  } else {
    res.status(403).json({ message: "invalid username or password" });
  }
});

app.get("/user/me", jwtAuthentication, async (req, res) => {
  try {
    const { username } = req.user;
    const getUser = Users.findOne({ username });
    if (getUser) {
      res.json({
        username: req.user.username,
      });
    } else {
      res.sendStatus(401);
    }
  } catch {
    (error) => {
      console.log(error);
      res.sendStatus(401);
    };
  }
});

app.get("/users/courses", jwtAuthentication, async (req, res) => {
  // logic to list all courses
  // logic to get all courses
  try {
    const courses = await Courses.find({});
    res.json({ courses });
  } catch (e) {
    console.log(e);
    res.sendStatus(404);
  }
});

//check if a course is purchased
app.get(
  "/users/courses/:courseId/check-purchase",
  jwtAuthentication,
  async (req, res) => {
    const courseId = req.params.courseId;
    const user = await Users.findOne({ username: req.user.username });

    if (!user) {
      return res.status(403).json({ message: "user not found" });
    }

    const isCoursePurchased = user.purchasedCourses.includes(courseId);
    res.json({ purchased: isCoursePurchased });
  }
);

//purchase a course
app.post("/users/courses/:courseId", jwtAuthentication, async (req, res) => {
  const id = req.params.courseId;
  const courseFound = await Courses.findById(id);
  if (!courseFound) {
    return res.status(404).json({ message: "Course not found" });
  }

  const user = await Users.findOne({ username: req.user.username });
  if (!user) {
    return res.status(403).json({ message: "User not found" });
  }

  // If the user already purchased the course, return a message indicating it.
  if (user.purchasedCourses.includes(id)) {
    return res.status(200).json({ message: "Course already purchased" });
  }

  // If the course is not purchased yet, add it to the user's purchasedCourses array and save.
  user.purchasedCourses.push(courseFound);
  await user.save();

  return res.status(200).json({ message: "Course purchased successfully" });
});

app.get("/users/purchasedCourses", jwtAuthentication, async (req, res) => {
  // logic to view purchased courses
  const user = await Users.findOne({ username: req.user.username }).populate(
    "purchasedCourses"
  );
  if (user) {
    //const purchased = user.purchasedCourses;
    res.json({ purchasedCourses: user.purchasedCourses || [] });
  } else {
    res.status(403).json({ message: "user not found" });
  }
});

app.put(
  "/users/courses/:courseId/:lessonId",
  jwtAuthentication,
  async (req, res) => {
    const courseId = req.params.courseId;
    const lessonId = req.params.lessonId;

    try {
      const user = await Users.findOne({ username: req.user.username });

      if (user && !user.purchasedCourses.includes(courseId)) {
        return res
          .status(403)
          .json({ error: "You have not purchased this course." });
      }

      const completedLessonsForCourse = await user.completedLessons.get(
        courseId
      );
      if (
        completedLessonsForCourse &&
        completedLessonsForCourse.includes(lessonId)
      ) {
        return res
          .status(400)
          .json({ message: "lesson already marked complete" });
      }

      if (!completedLessonsForCourse) {
        user.completedLessons.set(courseId, []);
      }

      user.completedLessons.get(courseId).push(lessonId);

      await user.save();
      return res.status(200).json({ message: "Lesson marked as completed" });
    } catch (e) {
      res
        .status(500)
        .json({ message: "An error occured while processing request." });
    }
  }
);

//get completed lessons for a course
app.get("/users/courses/:courseId", jwtAuthentication, async (req, res) => {
  const courseId = req.params.courseId;
  const user = await Users.findOne({ username: req.user.username });

  if (user && !user.purchasedCourses.includes(courseId)) {
    return res
      .status(403)
      .json({ error: "You have not purchased this course." });
  }

  if (user) {
    try {
      const completedLessonsForCourse = user.completedLessons.get(courseId);
      if (
        !completedLessonsForCourse ||
        completedLessonsForCourse.length === 0
      ) {
        return res.json({ message: "No completed lessons for this course." });
      }

      // Assuming you have a Lesson model with the Lessons variable
      const completedLessons = await Lessons.find({
        _id: { $in: completedLessonsForCourse },
      });

      res.json(completedLessons);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

// app.listen(3000, () => {
//   console.log("Server is listening on port 3000");
// });

// Start HTTPS server on port 443
httpsServer.listen(PORT, () => {
  console.log(`HTTPS server running on port ${PORT}`);
});
