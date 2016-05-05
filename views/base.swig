<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>Quiet Time{% if title %}: {{title}}{% endif %}</title>

    <link rel="stylesheet" href="/bootstrap/css/bootstrap.min.css"/>
    <link rel="stylesheet" href="/bootswatch/superhero/bootstrap.min.css"/>

    <style>footer { margin: 4em auto 1em auto; text-align: center }</style>

    <link rel="icon" type="image/png" sizes="32x32" href="/static/yoga32.png">
    <link rel="icon" type="image/png" sizes="64x64" href="/static/yoga64.png">
    <link rel="icon" type="image/png" sizes="128x128" href="/static/yoga128.png">
    <link rel="icon" type="image/png" sizes="256x256" href="/static/yoga256.png">

  </head>
  <body>
    <div class="container">
      <h1>
        <img src="/static/yoga128.png" />
        Quiet Time
      </h1>

      <p class="lead">
        Mute your Twitter friends… just for a little while.
      </p>

      <p>
        Is one of your faves live-tweeting The Bachelor? At a
        herpetology conference all weekend?  Ranting about politics?
        Relentlessly promoting their new web series? Mute them until
        they've calmed down.
      </p>

      {% block main %}{% endblock main %}

      {% block footer %}
      <footer>
        Quiet Time is <a href="https://github.com/kylewm/quiettime">on
        GitHub</a>. Have any problems? File an issue or come chat
        in #indiewebcamp on Freenode IRC.
      </footer>
      {% endblock footer %}

    </div>

    {% block scripts %}
    <script src="/jquery/jquery.min.js"></script>
    <script src="/bootstrap/js/bootstrap.min.js"></script>
    <script src="/moment/moment.min.js"></script>
    <script>
        function updateTimestamps() {
            $('time.relative-time').each(function () {
                $(this).text(
                    moment($(this).attr('datetime')).fromNow());
            });
        }
        updateTimestamps();
        setInterval(updateTimestamps, 30000);
    </script>
    {% endblock scripts %}
  </body>
</html>
