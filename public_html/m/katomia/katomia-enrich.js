

// glog("hello")

async function getTokenMeta(network, tokenId, serial){

  const params = { tokenId }

  if(serial)
    params.serial = serial

  const data = await getData(
    "/api/tokenMeta",
    params,
    86400
  )

  return data
}