package dev.hex.panel.bridge.console;

import dev.hex.panel.bridge.http.BridgeServer;
import org.apache.logging.log4j.core.Appender;
import org.apache.logging.log4j.core.Core;
import org.apache.logging.log4j.core.Filter;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.appender.AbstractAppender;
import org.apache.logging.log4j.core.config.plugins.Plugin;
import org.apache.logging.log4j.core.config.plugins.PluginAttribute;
import org.apache.logging.log4j.core.config.plugins.PluginElement;
import org.apache.logging.log4j.core.config.plugins.PluginFactory;

import java.io.Serializable;
import java.util.Map;

/**
 * Log4j appender that forwards console output lines to the WebSocket stream.
 */
@Plugin(name = "HexPanelConsoleAppender", category = Core.CATEGORY_NAME, elementType = Appender.ELEMENT_TYPE, printObject = true)
public class ConsoleAppender extends AbstractAppender {

    private static BridgeServer bridgeServer;

    protected ConsoleAppender(String name, Filter filter, org.apache.logging.log4j.core.Layout<? extends Serializable> layout) {
        super(name, filter, layout, true, org.apache.logging.log4j.core.config.Property.EMPTY_ARRAY);
    }

    public static void setBridgeServer(BridgeServer server) {
        bridgeServer = server;
    }

    @Override
    public void append(LogEvent event) {
        if (bridgeServer != null) {
            String message = event.getMessage().getFormattedMessage();
            bridgeServer.broadcastEvent(Map.of(
                "type", "console.line",
                "data", Map.of("line", message)
            ));
        }
    }

    @PluginFactory
    public static ConsoleAppender createAppender(
        @PluginAttribute("name") String name,
        @PluginElement("Filter") Filter filter
    ) {
        return new ConsoleAppender(name != null ? name : "HexPanelConsoleAppender", filter, null);
    }
}
