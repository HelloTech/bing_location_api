const request = require('request');
const mysql = require('mysql');
const bingKey = process.env.BING_KEY;

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.PORT,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE
});

let done = false;
let conn_count = 1;

let reduce_count = function(index, stop){
    if(index === stop){
        done = true;
    }
    conn_count -= 1;
    if(conn_count === 0 && done){
        console.log('fired');
        pool.end();
    }
};

pool.getConnection(function(err, connection){
    if(err){
        console.log(err);
    }
    let query = "SELECT users.zip, users.city, users.address1, users.id, users.type FROM users WHERE users.zip IS NOT NULL AND users.address1 IS NOT NULL AND users.city IS NOT NULL AND users.lng IS NULL;";
    connection.query(query, function(error, results, fields){
        if(error) throw error;
        connection.release();
        let stop = results.length;
        if(stop-- === 0){
            done = true
        }
        else{
            results.forEach(function(user, index){
                conn_count++;
                if(!user.zip || !user.address1){
                    reduce_count(index, stop);
                    return;
                }
                request.get({
                        url: 'http://dev.virtualearth.net/REST/v1/Locations',
                        qs: {
                            postalCode: user.zip === '<unknown>' ? '' : user.zip,
                            addressLine: user.address1 === '<unknown>' ? '' : user.address1,
                            include: 'queryParse',
                            locality: user.city === '<unknown>' ? '' : user.city,
                            maxResults: 1,
                            key: bingKey
                        }
                    },
                    function(err, res, body){
                        if(err){
                            reduce_count(index, stop);
                        }
                        else{
                            body = JSON.parse(body);
                            let resourceSets = body['resourceSets'];
                            if(resourceSets && resourceSets[0] && resourceSets[0].resources && resourceSets[0].resources[0] && resourceSets[0].resources[0].point && resourceSets[0].resources[0].point['coordinates']){
                                let coordinates = resourceSets[0].resources[0].point['coordinates'];
                                pool.getConnection(function(connection_err, conn){
                                    conn.query('UPDATE users SET lat = ?, lng = ? WHERE id = ?', [coordinates[0], coordinates[1], user.id], function(error, results, fields){
                                        if(error) throw error;
                                        conn.release();
                                        reduce_count(index, stop);
                                    });
                                })
                            }
                            else{
                                reduce_count(index, stop);
                            }
                        }
                    }
                );
            });
        }
        reduce_count(0, 1);
    });
});