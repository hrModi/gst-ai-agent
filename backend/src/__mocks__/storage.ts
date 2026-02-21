export const uploadToS3 = jest.fn().mockResolvedValue({ url: 'https://s3.example.com/test.json', key: 'test/key' })
export const getSignedUrl = jest.fn().mockResolvedValue('https://s3.example.com/signed-test.json')
export const deleteFromS3 = jest.fn().mockResolvedValue(undefined)
