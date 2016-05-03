drop table "user";
drop table "mute";

create table "user" (
       id character varying(256) primary key,
       screen_name character varying(256),
       access_token character varying(512),
       access_token_secret character varying(512));

create table "mute" (
       user_id character varying(256),
       screen_name character varying(256),
       start_time timestamp without time zone,
       end_time timestamp without time zone,
       primary key (user_id, screen_name),
       foreign key (user_id) references "user");
