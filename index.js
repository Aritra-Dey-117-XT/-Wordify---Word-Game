import "dotenv/config"
import express from "express"
import axios from "axios"
import say from "say"
import pos from 'pos'
import dictionary from 'dictionary-en';
import nspell from 'nspell';
import pg from "pg"
import {v4 as uuidv4} from "uuid"
import bcrypt from "bcrypt"
import passport from "passport"
import {Strategy as LocalStrategy} from "passport-local"
import session from "express-session"

const port = 3000
const app = express()
let words = []
let started = 0
let type = []
let points = 0

const db = new pg.Client({
    user: process.env.USER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: process.env.PORT
})

db.connect()

app.use(express.urlencoded({extended: true}))
app.use(express.static("public"))
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())

passport.use("local-register", new LocalStrategy(async(username, password, done) => {
    try{
        const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
        const existingUser = result.rows[0]
        if(existingUser) return done(null, false)
        const hashedPassword = await bcrypt.hash(password, 15)
        const newResult = await db.query("INSERT INTO users(user_id, username, password) VALUES($1, $2, $3) RETURNING *", [uuidv4(), username, hashedPassword])
        const newUser = newResult.rows[0]
        return done(null, newUser)
    } catch(error) {
        console.log(error)
        return done(error, false)
    }
}))

passport.use("local-login", new LocalStrategy(async(username, password, done) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE username = $1", [username])
        const user = result.rows[0]
        if(!user) return done(null, false)
        const passwordMatched = await bcrypt.compare(password, user.password)
    if(passwordMatched) {
        return done(null, user)
    } else {
        return done(null, false)
    }
    } catch(error) {
        console.log(error)
        return done(error, false)
    }
}))

passport.serializeUser((user, done) => {
    done(null, user.user_id)
})

passport.deserializeUser(async(id, done) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE user_id = $1", [id])
        const user = result.rows[0]
        done(null, user)
    } catch(error) {
        done(error, false)
    }
})


app.get("/register", (req, res) => {
    res.render("register.ejs")
})

app.get("/login", (req, res) => {
    res.render("login.ejs")
})

app.get("/", (req, res) => {
    if(req.isAuthenticated()) {
        words = []
        started = 0
        type = []
        points = 0
        res.render("index.ejs")
    } else {
        res.redirect("/login")
    }
})

app.get("/logout", (req, res) => {
    res.clearCookie("connect.sid")
    req.logOut(() => {
        res.redirect("/")
    }) 
})

app.post("/", async (req, res) => {

    let i = 0;
    if(req.body['Noun/Pronoun'] == "on")
        type.push("NN", "PDT", "PRP", "WP", "WP$", "WDT", "WRB", "CD", "DT", "EX", "PP$")
    if(req.body['Verb'] == "on")
        type.push("VB", "MD")
    if(req.body['Adjective'] == "on")
        type.push("JJ")

    function getPartOfSpeech(word) {
        const tagger = new pos.Tagger();
        const taggedWord = tagger.tag([word])[0];
        const partOfSpeech = taggedWord[1];
        return partOfSpeech;
    }
    
    async function isLegitEnglishWord(word) {
        const spell = nspell(dictionary);
        return spell.correct(word);
    }

    async function wordgenerator(words, letter, i) {
        let word = (await axios.get(`https://api.datamuse.com/words`, {
            params: {
                sp: `${letter}*`,
            }
        })).data[i].word
        if(words.includes(word) || !(type.includes(getPartOfSpeech(word))) || (word.length < 2) ) {
            return wordgenerator(words, letter, ++i)
        } else {
            words.push(word)
            return word
        }
    }

    if(started) {

        if(req.body.message) {
            let result_message = `Game Over! Your score is ${points}.`
            say.speak(result_message)
            res.render("index.ejs", {gameOver:true, points: points})

        } else {

            if((await isLegitEnglishWord(req.body['User Input']))) {

                if(req.body['User Input'][0] == req.body.word[req.body.word.length-1]) {

                    if(type.includes(getPartOfSpeech(req.body['User Input']))) {

                        if(!(words.includes(req.body['User Input']))) {
                            words.push(req.body['User Input'])
                            let letter = req.body['User Input'][req.body['User Input'].length - 1]
                            let word = await wordgenerator(words, letter, 0)
                            say.speak(word)
                            res.render("index.ejs", {submit: true, word: word, points: ++points})

                        } else {
                            let word = req.body.word
                            let error = "This word has already been used. Please enter a new word."
                            say.speak(error)
                            res.render("index.ejs", {submit: true, word: word, error: error, points: points})
                        }

                    } else {
                        let word = req.body.word
                        let error = "This word does not belong to the selected part of speech. Please enter a new word."
                        say.speak(error)
                        res.render("index.ejs", {submit: true, word: word, error: error, points: points})
                    }
                    
                } else {
                    let word = req.body.word
                    let error = "User Input should start with the last letter of the previous word."
                    say.speak(error)
                    res.render("index.ejs", {submit: true, word: word, error: error, points: points})
                }

            } else {
                let word = req.body.word
                let error = "This word does not exist in the English Dictionary. Please enter a valid word."
                say.speak(error)
                res.render("index.ejs", {submit: true, word: word, error: error, points: points})
            }
        }
    } else {
        started = 1
        let word = await wordgenerator(words, "a", i)
        say.speak(word)
        res.render("index.ejs", {submit: true, word: word})
    }
})

app.post("/register", passport.authenticate("local-register", {
    failureRedirect: "/register",
    successRedirect: "/"
}))

app.post("/login", passport.authenticate("local-login", {
    failureRedirect: "/login",
    successRedirect: "/"
}))

app.listen(port, () => {
    console.log(`Node Server is running on Port ${port}.`)
})