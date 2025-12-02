

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());
app.use(cors());

//Get the server frontend path, in folder with label public
app.use(express.static(path.join(__dirname, "public")));

// This is a locally stored memory system, works like a database
//This stores the email and role for each user
let users = [];          
//For eahc post it stores the id, giverEmail, title, description, pickup window. confirmation, and then if it is avaliable or not
let posts = [];          
//gets the post id requests, stores the student email, and what time they selected for pick up
let pickupRequests = {}; 

// Email Transport
const transporter = nodemailer.createTransport({
    jsonTransport: true
});

// Home route testing, ensure backend is properly running
app.get("/api", (req, res) => {
    res.json({ message: "Don't Toss, Give backend running." });
});

// Login for admin
app.post("/admin/login", (req, res) => {
    const { password } = req.body;
    if (password === "12345") {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false, message: "Incorrect password" });
});

// User login and creates a deault student for an unrecognized email
app.post("/user/login", (req, res) => {
    const { email } = req.body;

    let user = users.find(u => u.email === email);
    if (!user) {
        user = { email, role: "student" };
        users.push(user);
    }

    res.json({ success: true, user });
});

// How Admin promotes a user to GIVER
app.post("/admin/promote", (req, res) => {
    const { email } = req.body;

    let user = users.find(u => u.email === email);
    if (!user) {
        user = { email, role: "giver" };
        users.push(user);
    } else {
        user.role = "giver";
    }

    res.json({ success: true, message: `${email} is now a giver` });
});


//Proccess for the Giver to create a post
app.post("/giver/post", (req, res) => {
    const { giverEmail, title, description, window } = req.body;

    const giver = users.find(u => u.email === giverEmail && u.role === "giver");
    if (!giver)
        return res.status(401).json({ success: false, message: "Unauthorized giver" });

    const post = {
        id: uuidv4(),
        giverEmail,
        title,
        description,
        window,
        confirmed: false,
        taken: false
    };

    posts.push(post);

    // Notify all students, via email
    const students = users.filter(u => u.role === "student");
    students.forEach(student => {
        transporter.sendMail({
            from: "system@foodshare.com",
            to: student.email,
            subject: "New Food Donation",
            text: `${title}\n\n${description}`
        });
    });

    res.json({ success: true, post });
});

// Pull all posts that aren't taken currently
app.get("/posts", (req, res) => {
    const available = posts.filter(p => !p.taken);
    res.json(available);
});

// Student requests pickup
app.post("/student/request", (req, res) => {
    const { email, postId, time } = req.body;

    if (!pickupRequests[postId]) {
        pickupRequests[postId] = [];
    }

    pickupRequests[postId].push({
        requestId: uuidv4(),
        studentEmail: email,
        time
    });

    res.json({ success: true, message: "Pickup request sent" });
});

// FCFS system that makes first student to request first to appear for a pickup
app.get("/system/assign/:postId", (req, res) => {
    const postId = req.params.postId;

    const requests = pickupRequests[postId];
    if (!requests || requests.length === 0)
        return res.json({ success: false, message: "No requests yet" });

    const first = requests[0];

    res.json({
        success: true,
        assignedTo: first.studentEmail,
        time: first.time
    });
});


// Rejection in case Giver wants to reject the first in line
app.post("/giver/reject", (req, res) => {
    const { postId, giverEmail } = req.body;

    const post = posts.find(p => p.id === postId);
    if (!post)
        return res.status(404).json({ success: false, message: "Post not found" });

    if (post.giverEmail !== giverEmail)
        return res.status(403).json({ success: false, message: "Not your post" });

    const requests = pickupRequests[postId];
    if (!requests || requests.length === 0)
        return res.json({ success: false, message: "No requests to reject" });

    // Remove first request and push to end
    const rejected = requests.shift();
    requests.push(rejected);

    res.json({ success: true, message: `Rejected ${rejected.studentEmail}, moved to end of queue` });
});


// Giver confirms the pickup
app.post("/giver/confirm", (req, res) => {
    const { postId, giverEmail } = req.body;

    const post = posts.find(p => p.id === postId);
    if (!post)
        return res.status(404).json({ success: false, message: "Post not found" });

    if (post.giverEmail !== giverEmail)
        return res.status(403).json({ success: false, message: "Not your post" });

    post.taken = true;
    post.confirmed = true;

    // Get info for first student in line and return that information for the GIVER
    const requests = pickupRequests[postId] || [];
    const nextStudent = requests.length > 0 ? requests[0] : null;

    res.json({
        success: true,
        message: "Pickup confirmed — post closed",
        nextStudent 
    });
});

// Server Start :D
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
});
