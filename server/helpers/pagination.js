const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const DEFAULT_PAGE = 1;

function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit };
}

module.exports = { parsePagination, MAX_LIMIT, DEFAULT_LIMIT };
