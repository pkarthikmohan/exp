const YouTube = require('youtube-sr').default;

(async () => {
    try {
        const video = await YouTube.getVideo('dQw4w9WgXcQ'); // Rick Roll
        console.log('Video fetch success');
        if (video.related) {
             console.log('Related videos found:', video.related.length);
             console.log(JSON.stringify(video.related.slice(0, 3), null, 2));
        } else {
             console.log('No related videos field');
             console.log(Object.keys(video));
        }
        
        // Check if there is another way to get related
        // Maybe videos property?
        if (video.videos) {
            console.log('Videos property found:', video.videos.length);
        }

    } catch (e) {
        console.error(e);
    }
})();