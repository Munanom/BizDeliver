const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware configuration
app.use(session({
    secret: 'your_secret_key', // Replace with a strong secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

let users = [
    { username: 'manager', password: 'manager123', role: 'manager' },
    { username: 'deliveryguy', password: 'delivery123', role: 'deliveryguy' }
];  // Sample users data for authentication

let deliveryJobs = [];  // Array to store delivery jobs
let loginLogs = [];  // Array to store login/logout activities

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/');
}

// Middleware to check if user has the required role
function hasRole(role) {
    return function (req, res, next) {
        if (req.session.user && req.session.user.role === role) {
            return next();
        }
        res.status(403).send('Forbidden');
    };
}

// Route for rendering login page
app.get('/', (req, res) => {
    res.render('login', { message: null });
});

// Route for handling login POST requests
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.user = user; // Save user to session
        loginLogs.push({ username, action: 'login', time: new Date() });
        if (user.role === 'manager') {
            res.redirect('/manager');
        } else {
            res.redirect('/delivery-guy');
        }
    } else {
        res.render('login', { message: 'Invalid username or password' });
    }
});

// Route for logging out
app.post('/logout', (req, res) => {
    if (req.session.user) {
        loginLogs.push({ username: req.session.user.username, action: 'logout', time: new Date() });
    }
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to logout');
        }
        res.redirect('/');
    });
});

// Manager routes
app.get('/manager', isAuthenticated, hasRole('manager'), (req, res) => {
    res.render('layout', { content: 'manager/dashboard', user: req.session.user });
});

app.get('/manager/assign-job', isAuthenticated, hasRole('manager'), (req, res) => {
    res.render('layout', { content: 'manager/assign-job', user: req.session.user });
});

app.get('/manager/jobs-assigned', isAuthenticated, hasRole('manager'), (req, res) => {
    res.render('layout', { content: 'manager/jobs_assigned', deliveryJobs, user: req.session.user });
});

app.get('/manager/jobs-done', isAuthenticated, hasRole('manager'), (req, res) => {
    res.render('layout', { content: 'manager/jobs_done', deliveryJobs, user: req.session.user });
});

app.get('/manager/jobs-pending', isAuthenticated, hasRole('manager'), (req, res) => {
    res.render('layout', { content: 'manager/jobs_pending', deliveryJobs, user: req.session.user });
});

app.post('/assign-job', isAuthenticated, hasRole('manager'), async (req, res) => {
    // Extract form data from request body
    const { contactName, location, contactInfo, jobDescription } = req.body;

    // Define the path to the jobs.json file
    const filePath = path.join(__dirname, 'src', 'jobs.json');

    try {
        // Ensure the directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        // Read the existing jobs from the file
        let jobs = [];
        try {
            const data = await fs.readFile(filePath, 'utf8');
            jobs = JSON.parse(data);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err; // Throw if error is not due to file not existing
            }
        }

        // Add the new job to the array with a unique ID
        const newJob = { id: uuidv4(), contactName, location, contactInfo, jobDescription, assignedTo: 'deliveryguy', status: 'pending' };
        jobs.push(newJob);

        // Write the updated jobs array back to the file
        await fs.writeFile(filePath, JSON.stringify(jobs, null, 2), 'utf8');
        console.log('Job assigned and saved.');

        // Update the global deliveryJobs array
        deliveryJobs = jobs;

        res.redirect('/manager/jobs-assigned'); // Redirect or handle as needed
    } catch (err) {
        console.error('Failed to save job:', err);
        res.status(500).send('Server error');
    }
});

// Route to handle job deletion
app.post('/delete-job', isAuthenticated, hasRole('manager'), async (req, res) => {
    const { index } = req.body;

    // Remove the job from the array
    if (index >= 0 && index < deliveryJobs.length) {
        deliveryJobs.splice(index, 1);

        // Define the path to the jobs.json file
        const filePath = path.join(__dirname, 'src', 'jobs.json');

        try {
            // Write the updated jobs array back to the file
            await fs.writeFile(filePath, JSON.stringify(deliveryJobs, null, 2), 'utf8');
            console.log('Job deleted and saved.');
        } catch (err) {
            console.error('Failed to delete job:', err);
            return res.status(500).send('Server error');
        }
    }

    res.redirect('/manager/jobs-assigned'); // Redirect or handle as needed
});

// Delivery guy routes
app.get('/delivery-guy', isAuthenticated, hasRole('deliveryguy'), (req, res) => {
    const myJobs = deliveryJobs.filter(job => job.assignedTo === 'deliveryguy' && job.status !== 'complete');
    res.render('layout', { content: 'delivery_guy/dashboard', myJobs, user: req.session.user });
});

app.get('/delivery-guy/jobs-done', isAuthenticated, hasRole('deliveryguy'), (req, res) => {
    const myJobs = deliveryJobs.filter(job => job.assignedTo === 'deliveryguy' && job.status === 'complete');
    res.render('layout', { content: 'delivery_guy/jobs_done', myJobs, user: req.session.user });
});

app.get('/delivery-guy/jobs-pending', isAuthenticated, hasRole('deliveryguy'), (req, res) => {
    const myJobs = deliveryJobs.filter(job => job.assignedTo === 'deliveryguy' && job.status === 'pending');
    res.render('layout', { content: 'delivery_guy/jobs_pending', myJobs, user: req.session.user });
});

app.post('/update-job-status', isAuthenticated, hasRole('deliveryguy'), async (req, res) => {
    const { id, status } = req.body;
    const jobIndex = deliveryJobs.findIndex(job => job.id === id);

    if (jobIndex !== -1) {
        deliveryJobs[jobIndex].status = status;

        // Define the path to the jobs.json file
        const filePath = path.join(__dirname, 'src', 'jobs.json');

        try {
            // Write the updated jobs array back to the file
            await fs.writeFile(filePath, JSON.stringify(deliveryJobs, null, 2), 'utf8');
            console.log('Job status updated and saved.');
        } catch (err) {
            console.error('Failed to update job status:', err);
            return res.status(500).send('Server error');
        }
    }

    // Redirect based on the job status
    if (status === 'complete') {
        res.redirect('/delivery-guy/jobs-done');
    } else {
        res.redirect('/delivery-guy');
    }
});

// Route to render the login page
app.get('/login', (req, res) => {
    res.render('login');
});

// Starting the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
