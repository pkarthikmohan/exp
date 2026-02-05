const YouTube = require('youtube-sr').default;

async function test() {
    console.log("Searching for 'kannada song'...");
    try {
        const videos = await YouTube.search("kannada song", { limit: 5, type: 'video' });
        console.log(`Found ${videos.length} videos.`);
        videos.forEach(v => console.log(`- ${v.title}`));
    } catch (e) {
        console.error("Search failed:", e.message);
    }
}

test();
