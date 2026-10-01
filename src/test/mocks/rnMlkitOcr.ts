const MlkitOcr = {
  recognizeText: jest.fn(async () => ({ text: '', blocks: [] })),
};
export default MlkitOcr;
