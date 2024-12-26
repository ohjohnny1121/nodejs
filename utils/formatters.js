/**
 * 將物件陣列中的鍵名轉換為 camelCase 格式
 * @param {Array<Object>} data - 要轉換的物件陣列
 * @returns {Array<Object>} - 轉換後的物件陣列
 */
function convertToCamelCase(data) {
    return data.map(obj => 
        Object.fromEntries(
            Object.entries(obj).map(([key, value]) => {
                let newKey = key
                    .replace(/([a-z])([A-Z])/g, '$1_$2')
                    .toLowerCase();
                return [newKey, value];
            })
        )
    );
}

/**
 * 將物件陣列中的鍵名轉換為 snake_case 格式
 * @param {Array<Object>} data - 要轉換的物件陣列
 * @returns {Array<Object>} - 轉換後的物件陣列
 */
function convertToSnakeCase(data) {
    return data.map(obj => 
        Object.fromEntries(
            Object.entries(obj).map(([key, value]) => {
                let newKey = key
                    .replace(/([A-Z])/g, '_$1')
                    .toLowerCase()
                    .replace(/^_/, '');
                return [newKey, value];
            })
        )
    );
}

module.exports = {
    convertToCamelCase,
    convertToSnakeCase
}; 