module.exports = function (eleventyConfig) {

    eleventyConfig.addPassthroughCopy("src/assets");

    return {
        dir: {
            input: "src",
            includes: "_includes",
            layouts: "_layouts",
            data: "_data",
            output: "_site"
        }
    };

};