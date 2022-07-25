
import {Client} from 'sankaku-client'
import express from 'express'
import axios from 'axios'
import { createClient } from 'redis';


const app = express()
const port = process.env.PORT ?? 8081

//const redisClient = createClient();
//redisClient.on('error', (err) => console.log('Redis Client Error', err));
//await redisClient.connect();

const cache = {}

const redisClient = {
    set(key, val) {
        cache[key] = val
    },

    get(key) {
        return cache[key] ?? null
    }
}

let sankakuClient = new Client();

app.get('/image/:postId/:imageType', async (req, res) => {
    const link = await redisClient.get(`post-${req.params.postId}-${req.params.imageType}`)
    if(!link) {
        res.status(404).send("<h1>Page not found on the server</h1>")
        return
    }

    const {data} = await axios.get(link, {responseType: 'stream'})
    data.pipe(res)
})

app.get('/post/index.json', async (req, res) => {
    let request = req.query;

    let tags = []
    if(request.tags) {
        request.tags = request.tags.split(' ')
        request.tags.forEach(t => {
            const pts = t.split(':')
            if(pts.length == 2 && pts[0] == 'order') {
                request.order_by = pts[1]
                return
            }
            else {
                tags.push(t)
            }
        })

        request.tags = tags
    }
    
    if(!request.limit)
        request.limit = 50

    if(!request.page)
        request.page = 1
    else
        request.page = parseInt(request.page)
    
    //const page = Math.floor(request.offset / request.limit)
    const key = JSON.stringify({tags: request.tags, limit: request.limit, page: request.page})
    console.log(key)
    if(request.page > 1) {
        const metaVal = JSON.parse(await redisClient.get('query-ptr-' + key))
        if(!metaVal) {
            res.status(404).send("<h1>Page not found on the server</h1>")
            return
        } else {
            request.next = metaVal.next
            //request.prev = metaVal.prev
        }
    }

    console.log(request)
    const data = await sankakuClient.searchSubmissions(request);
    if(data.meta.next) {
        const nextKey = JSON.stringify({tags: request.tags, limit: request.limit, page: request.page + 1})
        console.log(nextKey)
        redisClient.set('query-ptr-' + nextKey, JSON.stringify({next: data.meta.next, prev: data.meta.prev}))
    }
    
    //console.log(data)
    res.json(data.data.map(ip => {
        let p = ip

        if(ip.sample_url) {
            redisClient.set(`post-${ip.id}-sample_url`, ip.sample_url)
            p.sample_url = 'https://skk2booru.herokuapp.com/image/' + ip.id + '/sample_url'
        }
        if(ip.preview_url) {
            redisClient.set(`post-${ip.id}-preview_url`, ip.preview_url)
            p.preview_url = 'https://skk2booru.herokuapp.com/image/' + ip.id + '/preview_url'
        }
        if(ip.file_url) {
            redisClient.set(`post-${ip.id}-file_url`, ip.file_url)
            p.file_url = 'https://skk2booru.herokuapp.com/image/' + ip.id + '/file_url'
        }

        p.created_at = (new Date(ip.created_at.s * 1000)).toDateString();
        p.author = ip.author.name
        p.tags = ip.tags.map(t => t.tagName).join(' ')
        return p
    }));
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})