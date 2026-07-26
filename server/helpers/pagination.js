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

function paginateResult(db, countSql, countParams, dataSql, dataParams, page, limit) {
  const offset = (page - 1) * limit;
  const countResult = db.exec(countSql, countParams || []);
  const total = (countResult.length > 0 && countResult[0].values.length > 0)
    ? countResult[0].values[0][0]
    : 0;
  const dataResult = db.exec(dataSql + ` LIMIT ? OFFSET ?`, [...(dataParams || []), limit, offset]);
  return {
    data: dataResult,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

function paginateResponse(res, paginatedResult, transformFn) {
  const { data, pagination } = paginatedResult;
  const items = transformFn ? transformFn(data) : require('../routes/crud').queryToObjects(data);
  res.json({ data: items, pagination });
}

module.exports = { parsePagination, paginateResult, paginateResponse, MAX_LIMIT, DEFAULT_LIMIT };
