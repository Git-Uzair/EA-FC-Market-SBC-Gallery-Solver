async (page) => {
  return {
    status: "ok",
    tabUrl: page.url()
  };
}