const request = require('request');
const mysql = require('mysql');
const bingKey = process.env.BING_KEY;

const pool = mysql.createPool({
    host: process.env.POOL,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE
});
let done = false;
let conn_count = 1;
let enque_count = 0;
let connection_count = 0;

let reduce_count = function(num){
    enque_count--;
    connection_count--;
    console.log('release: ', conn_count);
    conn_count -= num;
    if(conn_count === 0 && done){
        console.log('fired');
        pool.end();
    }
};

pool.getConnection(function(err, connection){
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
                request.get({
                        url: 'http://dev.virtualearth.net/REST/v1/Locations',
                        qs: {
                            postalCode: user.zip,
                            addressLine: user.address1,
                            include: 'queryParse',
                            locality: user.city,
                            maxResults: 1,
                            key: bingKey
                        }
                    },
                    function(err, res, body){
                        if(err){
                            console.log(err);
                        }
                        else{
                            body = JSON.parse(body);
                            let recourceSets = body['resourceSets'];
                            if(recourceSets && recourceSets[0] && recourceSets[0].resources && recourceSets[0].resources[0] && recourceSets[0].resources[0].point && recourceSets[0].resources[0].point['ccordinates']){
                                let coordinates = recourceSets[0].resources[0].point['ccordinates'];
                                conn_count++;
                                pool.getConnection(function(connection_err, conn){
                                    conn.query('UPDATE users SET lat = ?, lng = ? WHERE id = ?', [coordinates[0], coordinates[1], user.id], function(error, results, fields){
                                        if(error) throw error;
                                        conn.release();
                                        reduce_count(1);
                                        console.log(results);
                                    });
                                })
                            }
                            else{
                                reduce_count(0);
                            }
                        }
                        console.log('fired after query');
                        if(index === stop){
                            done = true;
                        }
                    }
                );
            });
        }
        reduce_count(1);
    });
});

pool.on('enqueue', function(){
    console.log('enque: ', ++enque_count);
});

pool.on('connection', function(){
    console.log('connect: ', ++connection_count);
});