// src/utils/imageService.js

/**
 * 获取必应每日壁纸。
 * API 文档: https://github.com/xCss/bing/tree/main/api
 * 我们使用一个反向代理来避免CORS问题。
 * @returns {Promise<{url: string} | null>} 包含壁纸URL的对象，或在失败时返回null。
 */
export const fetchBingDailyPhoto = async () => {
  // 使用一个可靠的第三方API或自建代理来获取Bing壁纸，避免直接请求bing.com可能遇到的CORS问题。
  // 'https://bing.img.run/rand.php' 是一个会重定向到随机Bing图片的服务。
  // 如果需要当天的图片，可以使用 'https://bing.img.run/uhd.php'
  const BING_API_URL = 'https://bing.img.run/uhd.php';

  try {
    // fetch 会自动处理重定向，并获取最终的图片URL
    const response = await fetch(BING_API_URL);
    if (!response.ok) {
      throw new Error(`Network response was not ok, status: ${response.status}`);
    }
    // response.url 就是重定向后的最终图片URL
    const imageUrl = response.url;
    console.log('Fetched Bing Photo URL:', imageUrl);
    return { url: imageUrl };
  } catch (error) {
    console.error('Failed to fetch Bing daily photo:', error);
    return null;
  }
};

/**
 * 预加载并缓存图片到浏览器缓存。
 * @param {string} url 图片的URL
 */
export const cacheImage = (url) => {
  const img = new Image();
  img.src = url;
};
