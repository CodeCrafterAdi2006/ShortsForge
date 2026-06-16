//const { getJson } = require("serpapi")
//
//getJson({
//    engine: "google",
//    q: "cafe",
//    location: "London, England, United Kingdom",
//    google_domain: "google.co.uk",
//    hl:"en",
//    gl: "in",
//    api_key: "2c0a201c9f97d2482d83544a429d3d069bd70729ec17c707d13aa4bbec0c6307"
//}, (json) => {
//    console.log(json)
//})

//const { getJson } = require("serpapi")
//
//getJson({
//    engine: "google_short_videos",
//    q: "labubu",
//    api_key: "2c0a201c9f97d2482d83544a429d3d069bd70729ec17c707d13aa4bbec0c6307"
//}, (json) => {
//    console.log(json)
//})

//const serpapi = require("serpapi");
//
//console.log(serpapi);

const { getJson } = require("serpapi")

getJson({
    engine: "google_lens",
    url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRtQHUnDrIgh4rMhlQNGTQ75nsbNW95bM_dFr-sloX_I8TlMqPbJ9TN1CIv565uxeyoLDiW4CgOAFzr4icU1OqEAP7PA_c1jNeV9O5bq7Hp&s=10",
    api_key: "2c0a201c9f97d2482d83544a429d3d069bd70729ec17c707d13aa4bbec0c6307"
}, (json) => {
    console.log(json['visual_matches'])
})
