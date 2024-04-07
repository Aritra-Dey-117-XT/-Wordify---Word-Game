import express from "express"
import axios from "axios"
import say from "say"
import pos from 'pos'
import dictionary from 'dictionary-en';
import nspell from 'nspell';

const port = 3000
const app = express()
let words = []
let started = 0
let type = []
let points = 0

app.use(express.urlencoded({extended: true}))
app.use(express.static("public"))

app.get("/", (req, res) => {
    res.render("index.ejs")
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
    } else {
        started = 1
        let word = await wordgenerator(words, "a", i)
        say.speak(word)
        res.render("index.ejs", {submit: true, word: word})
    }
})

app.listen(port, () => {
    console.log(`Node Server is running on Port ${port}.`)
})


app.get("/lt", (req, res) => {
    res.render("liveTranscript.ejs")
})