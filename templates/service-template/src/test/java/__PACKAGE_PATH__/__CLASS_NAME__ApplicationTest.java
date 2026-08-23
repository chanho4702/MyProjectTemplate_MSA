package __BASE_PACKAGE__;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class __CLASS_NAME__ApplicationTest {
    @Test
    void applicationClassExists() {
        assertThat(__CLASS_NAME__Application.class).isNotNull();
    }

    @Test
    void localProfileResolvesDatasourceFromLocalDefaults() {
        MockEnvironment environment = environmentForProfile("local");

        assertThat(environment.getProperty("platform.datasource.writer.url"))
                .isEqualTo("jdbc:postgresql://localhost:5432/appdb");
        assertThat(environment.getProperty("platform.datasource.writer.username")).isEqualTo("app");
        assertThat(environment.getProperty("platform.datasource.writer.password")).isNotEmpty();
    }

    @Test
    void devProfileFailsFastWithoutExternalDatasourceSettings() {
        MockEnvironment environment = environmentForProfile("dev");

        assertThatThrownBy(() -> environment.getProperty("platform.datasource.writer.url"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("DB_WRITER_URL");
    }

    @Test
    void prodProfileFailsFastWithoutExternalDatasourceSettings() {
        MockEnvironment environment = environmentForProfile("prod");

        assertThatThrownBy(() -> environment.getProperty("platform.datasource.writer.url"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("DB_WRITER_URL");
    }

    // Loads the same application*.yml chain (including generated
    // application-platform-<feature>.yml imports) that SpringApplication reads
    // at startup, without requiring a database connection.
    private MockEnvironment environmentForProfile(String profile) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        ConfigDataEnvironmentPostProcessor.applyTo(environment);
        return environment;
    }
}
